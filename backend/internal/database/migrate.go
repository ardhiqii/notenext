package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"

	"github.com/rs/zerolog/log"
)

// acquireMigrationLock takes an exclusive advisory lock (flock) on a
// <db-file>.migrate.lock file so that only one process runs migrations at a
// time. Two API instances starting simultaneously would otherwise both apply
// migrations (SQLITE_BUSY / duplicate seeded rows). The lock is held until
// the returned release func is called; for in-memory databases (no backing
// file) it is a no-op.
func acquireMigrationLock(db *sql.DB) (func(), error) {
	noop := func() {}
	file := ""
	rows, err := db.Query("PRAGMA database_list")
	if err != nil {
		// Never fail startup because the lock could not be probed: fall back
		// to running without a lock rather than blocking boot.
		log.Warn().Err(err).Msg("could not probe database file for migration lock, proceeding without lock")
		return noop, nil
	}
	defer rows.Close()
	for rows.Next() {
		var seq int
		var name, dbFile string
		if err := rows.Scan(&seq, &name, &dbFile); err != nil {
			continue
		}
		if name == "main" {
			file = dbFile
			break
		}
	}
	// In-memory DBs are per-process: nothing to lock against.
	if file == "" || file == ":memory:" {
		return noop, nil
	}
	lockPath := file + ".migrate.lock"
	lockFile, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return noop, fmt.Errorf("open migration lock file: %w", err)
	}
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX); err != nil {
		lockFile.Close()
		return noop, fmt.Errorf("acquire migration lock %s: %w", lockPath, err)
	}
	log.Info().Str("lock_file", lockPath).Msg("acquired migration lock")
	return func() {
		_ = syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN)
		_ = lockFile.Close()
	}, nil
}

// RunMigrations reads SQL migration files from dir and applies them in order.
// Uses a schema_migrations table to track applied versions.
// Migrations are named: NNN_description.up.sql and NNN_description.down.sql
func RunMigrations(db *sql.DB, migrationsDir string) error {
	// Serialize concurrent runners (e.g. two API replicas booting at once).
	release, err := acquireMigrationLock(db)
	if err != nil {
		return err
	}
	defer release()

	// Check if migrations directory exists
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		log.Warn().Str("dir", migrationsDir).Msg("migrations directory not found, skipping")
		return nil
	}
	// Ensure migrations tracking table exists
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	// Find all .up.sql files
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	type migration struct {
		version string
		upFile  string
	}
	var migrations []migration
	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, ".up.sql") {
			parts := strings.SplitN(name, "_", 2)
			if len(parts) >= 1 {
				migrations = append(migrations, migration{
					version: parts[0],
					upFile:  name,
				})
			}
		}
	}
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].version < migrations[j].version
	})

	// Apply pending migrations
	for _, m := range migrations {
		var exists bool
		err := db.QueryRow("SELECT 1 FROM schema_migrations WHERE version = ?", m.version).Scan(&exists)
		if err == nil {
			log.Debug().Str("version", m.version).Msg("migration already applied, skipping")
			continue
		}

		// Read and execute
		path := filepath.Join(migrationsDir, m.upFile)
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", m.version, err)
		}

		log.Info().Str("version", m.version).Str("file", m.upFile).Msg("applying migration")

		// Execute the whole migration file atomically: every statement plus the
		// schema_migrations record inside one transaction, so a crash mid-file
		// leaves no partial state and the version is never recorded before the
		// statements it describes are durable.
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin transaction for migration %s: %w", m.version, err)
		}

		// Execute each statement separately (split by semicolons, skip empty)
		statements := splitSQL(string(sql))
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := tx.Exec(stmt); err != nil {
				errStr := err.Error()
				// SQLite doesn't support IF NOT EXISTS for ALTER TABLE / CREATE INDEX.
				// Treat "already exists" errors as idempotent — migration was already applied.
				if strings.Contains(errStr, "duplicate column name") ||
					strings.Contains(errStr, "already exists") ||
					strings.Contains(errStr, "index idx_") && strings.Contains(errStr, "already exists") {
					log.Warn().Str("version", m.version).Str("sql", stmt[:min(80, len(stmt))]).Msg("already applied, skipping statement")
					continue
				}
				_ = tx.Rollback()
				return fmt.Errorf("migration %s failed: %w\nSQL: %s", m.version, err, stmt[:min(100, len(stmt))])
			}
		}

		// Record migration in the same transaction as its statements.
		if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES (?)", m.version); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", m.version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", m.version, err)
		}

		log.Info().Str("version", m.version).Msg("migration applied successfully")
	}

	return nil
}

// splitSQL splits SQL text into individual statements.
// Handles basic semicolon splitting — doesn't handle semicolons inside strings.
// Strips comment lines (-- ...) from the start and end of each statement.
func splitSQL(sql string) []string {
	var statements []string
	parts := strings.Split(sql, ";")
	for _, p := range parts {
		p = stripSQLComments(p)
		if p != "" {
			statements = append(statements, p)
		}
	}
	return statements
}

// stripSQLComments removes "--" comment lines from the start and end of a SQL statement.
// It preserves comments that appear between SQL tokens (unlikely in migrations).
func stripSQLComments(s string) string {
	lines := strings.Split(s, "\n")

	// Strip leading comment lines
	start := 0
	for start < len(lines) {
		trimmed := strings.TrimSpace(lines[start])
		if trimmed == "" || strings.HasPrefix(trimmed, "--") {
			start++
		} else {
			break
		}
	}

	// Strip trailing comment lines
	end := len(lines) - 1
	for end >= start {
		trimmed := strings.TrimSpace(lines[end])
		if trimmed == "" || strings.HasPrefix(trimmed, "--") {
			end--
		} else {
			break
		}
	}

	if start > end {
		return ""
	}

	result := strings.Join(lines[start:end+1], "\n")
	return strings.TrimSpace(result)
}

// RunMigrations reads SQL migration files from dir and applies them in order.

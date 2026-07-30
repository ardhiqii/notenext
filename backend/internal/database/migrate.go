package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/rs/zerolog/log"
)

// RunMigrations reads SQL migration files from dir and applies them in order.
// Uses a schema_migrations table to track applied versions.
// Migrations are named: NNN_description.up.sql and NNN_description.down.sql
func RunMigrations(db *sql.DB, migrationsDir string) error {
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

		// Execute each statement separately (split by semicolons, skip empty)
		statements := splitSQL(string(sql))
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				errStr := err.Error()
				// SQLite doesn't support IF NOT EXISTS for ALTER TABLE / CREATE INDEX.
				// Treat "already exists" errors as idempotent — migration was already applied.
				if strings.Contains(errStr, "duplicate column name") ||
					strings.Contains(errStr, "already exists") ||
					strings.Contains(errStr, "index idx_") && strings.Contains(errStr, "already exists") {
					log.Warn().Str("version", m.version).Str("sql", stmt[:min(80, len(stmt))]).Msg("already applied, skipping statement")
					continue
				}
				return fmt.Errorf("migration %s failed: %w\nSQL: %s", m.version, err, stmt[:min(100, len(stmt))])
			}
		}

		// Record migration
		if _, err := db.Exec("INSERT INTO schema_migrations (version) VALUES (?)", m.version); err != nil {
			return fmt.Errorf("record migration %s: %w", m.version, err)
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
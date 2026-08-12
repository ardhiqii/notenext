package database

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	_ "modernc.org/sqlite"
)

type Config struct {
	Driver            string
	Source            string
	ConnectionTimeOut time.Duration
}

type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

var (
	QueryTimeOutDuration = 5 * time.Second
)

func NewDatabaseClient(config Config) (*sql.DB, error) {
	// SQLite (modernc.org/sqlite) fails concurrent writes immediately with
	// SQLITE_BUSY unless a busy timeout is set. The FE fires multiple write
	// requests in parallel (e.g. drag-reorder sends one PATCH per moved tab),
	// so without this the "database is locked" errors surface as random 500s
	// and the reorder silently never persists. Append the pragma to any DSN
	// that doesn't already set it — dev and prod env files both benefit.
	source := config.Source
	if config.Driver == "sqlite" && !strings.Contains(source, "busy_timeout") {
		sep := "?"
		if strings.Contains(source, "?") {
			sep = "&"
		}
		source = source + sep + "_pragma=busy_timeout(5000)"
	}

	// SQLite disables foreign key enforcement by default. Migration 003
	// declares notes.group_id REFERENCES tab_groups(id) ON DELETE SET NULL;
	// with FK off, deleting a group leaves notes pointing at a dangling
	// group_id and they vanish from the sidebar. Enable enforcement so the
	// declared cascade behavior actually runs.
	if config.Driver == "sqlite" && !strings.Contains(source, "foreign_keys") {
		sep := "?"
		if strings.Contains(source, "?") {
			sep = "&"
		}
		source = source + sep + "_pragma=foreign_keys(1)"
	}

	db, err := sql.Open(config.Driver, source)
	if err != nil {
		return nil, fmt.Errorf("database connection failed: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.ConnectionTimeOut)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %w", err)
	}

	return db, nil
}

// InitializeTable runs all pending database migrations.
func InitializeTable(db *sql.DB) error {
	log.Info().Msg("Running database migrations...")
	return RunMigrations(db, "migrations")
}

// SeedGlobalNotes inserts the default welcome notes if none exist.
func SeedGlobalNotes(db *sql.DB) error {
	var count int
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	query := `
	SELECT COUNT(*) FROM notes WHERE user_id IS NULL
	`
	db.QueryRowContext(ctx, query).Scan(&count)
	if count >= 3 {
		return nil
	}
	notes := []struct{ id, title, content string }{
		{"global-note-1", "Welcome", "This is a shared note."},
		{"global-note-2", "Getting Started", "Edit or delete this note."},
		{"global-note-3", "Note 3", "Your third global note."},
	}
	query = `
	INSERT OR IGNORE INTO notes (id,user_id,title,content,position_at,is_seed) VALUES (?,NULL,?,?,?,1)
	`
	for i, n := range notes {
		_, err := db.ExecContext(ctx, query, n.id, n.title, n.content, i+1)
		if err != nil {
			return err
		}
	}
	return nil
}

func WithTx(db *sql.DB, ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

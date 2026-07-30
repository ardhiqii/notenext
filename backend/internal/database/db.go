package database

import (
	"context"
	"database/sql"
	"fmt"
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
	db, err := sql.Open(config.Driver, config.Source)
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
	INSERT OR IGNORE INTO notes (id,user_id,title,content,position_at) VALUES (?,NULL,?,?,?)
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

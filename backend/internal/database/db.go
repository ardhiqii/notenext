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

func InitializeTable(db *sql.DB) error {
	log.Info().Msg("Initializing database tables...")
	if err := createUserTable(db); err != nil {
		return fmt.Errorf("failed to create user table: %w", err)
	}
	if err := createOAuthAccountTable(db); err != nil {
		return fmt.Errorf("failed to create oauth account table: %w", err)
	}
	if err := createNoteTable(db); err != nil {
		return fmt.Errorf("failed to create notes table: %w", err)
	}
	return nil
}

func createUserTable(db *sql.DB) error {
	log.Info().Msg("Creating user table if not exists...")
	query := `
	CREATE TABLE IF NOT EXISTS users(
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE,
		name TEXT NOT NULL,
		avatar_url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
	`
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeOutDuration)
	defer cancel()
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return err
	}

	log.Info().Msg("Users table created or already exists")
	return nil
}

func createOAuthAccountTable(db *sql.DB) error {
	log.Info().Msg("Creating user table if not exists...")
	query := `
	CREATE TABLE IF NOT EXISTS oauth_accounts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		provider TEXT NOT NULL,
		provider_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(provider, provider_id)
	)
	`
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeOutDuration)
	defer cancel()

	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return err
	}

	log.Info().Msg("OAuth Account table created or already exists")
	return nil
}

func createNoteTable(db *sql.DB) error {
	log.Info().Msg("Creating notes table if not exists...")

	query := `
	CREATE TABLE IF NOT EXISTS notes (
		id TEXT PRIMARY KEY,
		user_id TEXT REFERENCES users(id),
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		position_at INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
	`
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeOutDuration)
	defer cancel()
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return err
	}

	log.Info().Msg("Notes table created or already exists")
	return nil
}

func SeedGlobalNotes(db *sql.DB) error {
	var count int
	ctx,cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	query := `
	SELECT COUNT(*) FROM notes WHERE user_id IS NULL
	`
	db.QueryRowContext(ctx,query).Scan(&count)
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
	for i,n := range notes{
		_,err := db.ExecContext(ctx,query,n.id,n.title, n.content, i+1)
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

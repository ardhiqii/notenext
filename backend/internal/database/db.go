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
	if err := createNoteTable(db); err != nil {
		return fmt.Errorf("failed to create notes table: %w", err)
	}
	return nil
}

func createNoteTable(db *sql.DB) error {
	log.Info().Msg("Creating notes table if not exists...")

	query := `
	CREATE TABLE IF NOT EXISTS notes (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		position_at INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
	`
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeOutDuration)
	defer cancel()
	res, err := db.ExecContext(ctx, query)
	if err != nil {
		return err
	}

	_, err = res.RowsAffected()
	if err != nil {
		return err
	}

	log.Info().Msg("Notes table created or already exists")
	return nil
}

package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type Config struct {
	Driver            string
	Source            string
	ConnectionTimeOut time.Duration
}

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

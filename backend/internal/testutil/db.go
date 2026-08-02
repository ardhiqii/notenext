package testutil

import (
	"context"
	"database/sql"
	"path/filepath"
	"runtime"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/rs/zerolog"
	_ "modernc.org/sqlite"
)

// migrationsDir resolves the backend migrations directory relative to this
// source file, so tests work regardless of the package directory they run
// from (go test sets cwd to the package dir, where a bare "migrations"
// relative path would not resolve).
func migrationsDir() string {
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
}

// NewTestDB opens an in-memory SQLite database, applies all migrations, and
// removes the seeded global notes so each test starts from a clean slate.
//
// Gotchas handled:
//   - ":memory:" databases are per-connection: the pool is pinned to a single
//     connection (SetMaxOpenConns(1)) so every query hits the same DB.
//   - The migration path is relative in production code; here it is resolved
//     explicitly relative to this file (see migrationsDir).
func NewTestDB() (*sql.DB, error) {
	// Keep migration logs out of -v test output.
	zerolog.SetGlobalLevel(zerolog.WarnLevel)

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	// Critical for in-memory SQLite: one connection == one database.
	db.SetMaxOpenConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := database.RunMigrations(db, migrationsDir()); err != nil {
		_ = db.Close()
		return nil, err
	}

	// Migration 001 seeds 3 global notes (user_id NULL). Drop them plus any
	// tab_groups so tests are deterministic.
	if _, err := db.Exec(`DELETE FROM notes`); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.Exec(`DELETE FROM tab_groups`); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

// NullIfEmpty maps an empty userID to NULL for direct SQL inserts.
func NullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

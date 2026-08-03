package database

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// newFileTestDB opens a file-backed SQLite DB in a temp dir (file-backed so
// the migration lock actually engages, unlike :memory:).
func newFileTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db, dbPath
}

func writeMigrationFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("write migration %s: %v", name, err)
	}
}

func TestRunMigrationsIsTransactionalPerFile(t *testing.T) {
	dir := t.TempDir()
	migDir := filepath.Join(dir, "migrations")
	if err := os.MkdirAll(migDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// This migration creates a table, inserts a row, then fails on a
	// statement referencing a missing table. The whole file must roll back:
	// neither the table nor the schema_migrations record may survive.
	writeMigrationFile(t, migDir, "001_partial.up.sql", `
-- 001_partial
CREATE TABLE IF NOT EXISTS partial_ok (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO partial_ok (id, name) VALUES (1, 'hello');
INSERT INTO missing_table (id) VALUES (1);
`)

	db, _ := newFileTestDB(t)
	err := RunMigrations(db, migDir)
	if err == nil {
		t.Fatal("expected migration to fail")
	}

	// Table created by the first statement must have been rolled back.
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='partial_ok'`).Scan(&n); err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	if n != 0 {
		t.Fatalf("partial_ok table survived a failed migration (expected rollback), count=%d", n)
	}

	// Version must not be recorded for the failed migration.
	var v int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version='001'`).Scan(&v); err != nil {
		t.Fatalf("query schema_migrations: %v", err)
	}
	if v != 0 {
		t.Fatalf("version 001 recorded despite failed migration (expected rollback)")
	}

	// After fixing the file, the migration must apply cleanly.
	writeMigrationFile(t, migDir, "001_partial.up.sql", `
-- 001_partial (fixed)
CREATE TABLE IF NOT EXISTS partial_ok (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO partial_ok (id, name) VALUES (1, 'hello');
`)
	if err := RunMigrations(db, migDir); err != nil {
		t.Fatalf("migration should succeed after fix: %v", err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM partial_ok`).Scan(&n); err != nil {
		t.Fatalf("query partial_ok: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 row in partial_ok, got %d", n)
	}
}

func TestRunMigrationsKeepsIdempotentToleranceInsideTx(t *testing.T) {
	dir := t.TempDir()
	migDir := filepath.Join(dir, "migrations")
	if err := os.MkdirAll(migDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Duplicate column errors must be tolerated inside the transaction
	// (idempotent re-run), while real errors still abort and roll back.
	writeMigrationFile(t, migDir, "001_dup.up.sql", `
-- 001_dup
CREATE TABLE IF NOT EXISTS dup_ok (id INTEGER PRIMARY KEY, name TEXT);
ALTER TABLE dup_ok ADD COLUMN extra TEXT;
ALTER TABLE dup_ok ADD COLUMN extra TEXT;
`)

	db, _ := newFileTestDB(t)
	if err := RunMigrations(db, migDir); err != nil {
		t.Fatalf("idempotent duplicate column should be tolerated: %v", err)
	}

	// Re-running must skip the already-applied migration entirely.
	if err := RunMigrations(db, migDir); err != nil {
		t.Fatalf("second run should skip: %v", err)
	}
	var v int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version='001'`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != 1 {
		t.Fatalf("expected exactly one schema_migrations record, got %d", v)
	}
}

func TestAcquireMigrationLockBlocksConcurrentRunner(t *testing.T) {
	db, _ := newFileTestDB(t)

	release1, err := acquireMigrationLock(db)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}

	// A second acquire must block until the first lock is released.
	acquired := make(chan struct{})
	release2 := make(chan func())
	go func() {
		rel, err := acquireMigrationLock(db)
		if err != nil {
			t.Errorf("second acquire: %v", err)
			close(acquired)
			return
		}
		release2 <- rel
		close(acquired)
	}()

	select {
	case <-acquired:
		t.Fatal("second acquire should have blocked while first lock held")
	case <-time.After(300 * time.Millisecond):
		// expected: still blocked
	}

	release1()

	select {
	case rel := <-release2:
		rel()
	case <-time.After(3 * time.Second):
		t.Fatal("second acquire did not proceed after release")
	}
}

func TestRunMigrationsSerializesAcrossInstances(t *testing.T) {
	dir := t.TempDir()
	migDir := filepath.Join(dir, "migrations")
	if err := os.MkdirAll(migDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// A seed-style migration whose statements are NOT idempotent: running it
	// twice would duplicate rows. The lock must prevent that.
	writeMigrationFile(t, migDir, "001_seed.up.sql", `
-- 001_seed
CREATE TABLE IF NOT EXISTS seeded (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO seeded (name) VALUES ('General');
INSERT INTO seeded (name) VALUES ('General');
`)

	// Simulate two instances booting concurrently on the same DB file.
	db1, dbPath := newFileTestDB(t)
	db2, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()

	results := make(chan error, 2)
	go func() { results <- RunMigrations(db1, migDir) }()
	go func() { results <- RunMigrations(db2, migDir) }()

	for i := 0; i < 2; i++ {
		select {
		case err := <-results:
			if err != nil {
				t.Fatalf("concurrent migration failed: %v", err)
			}
		case <-time.After(10 * time.Second):
			t.Fatal("concurrent migration timed out")
		}
	}

	// Exactly one instance must have applied the seed (2 rows total, not 4).
	var count int
	if err := db1.QueryRow(`SELECT COUNT(*) FROM seeded`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected seed applied exactly once (2 rows), got %d rows (duplicate 'General' rows!)", count)
	}
	var versions int
	if err := db1.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version='001'`).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if versions != 1 {
		t.Fatalf("expected exactly one schema_migrations record, got %d", versions)
	}
}

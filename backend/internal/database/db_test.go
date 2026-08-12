package database

import (
	"testing"
	"time"
)

// Regression (bug hunt B2): SQLite ships with foreign_keys OFF, so the
// ON DELETE SET NULL declared by migration 003 never ran — deleting a group
// left notes with dangling group_id references. NewDatabaseClient must append
// the foreign_keys pragma to the DSN so enforcement is on for every
// connection the pool opens.
func TestNewDatabaseClientEnablesForeignKeys(t *testing.T) {
	db, err := NewDatabaseClient(Config{
		Driver:            "sqlite",
		Source:            ":memory:",
		ConnectionTimeOut: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewDatabaseClient: %v", err)
	}
	defer db.Close()

	var fk int
	if err := db.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		t.Fatalf("query foreign_keys pragma: %v", err)
	}
	if fk != 1 {
		t.Fatalf("expected PRAGMA foreign_keys = 1, got %d", fk)
	}
}

// The busy_timeout pragma must survive alongside the new foreign_keys pragma.
func TestNewDatabaseClientKeepsBusyTimeout(t *testing.T) {
	db, err := NewDatabaseClient(Config{
		Driver:            "sqlite",
		Source:            ":memory:",
		ConnectionTimeOut: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewDatabaseClient: %v", err)
	}
	defer db.Close()

	var busy int
	if err := db.QueryRow("PRAGMA busy_timeout").Scan(&busy); err != nil {
		t.Fatalf("query busy_timeout pragma: %v", err)
	}
	if busy != 5000 {
		t.Fatalf("expected PRAGMA busy_timeout = 5000, got %d", busy)
	}
}

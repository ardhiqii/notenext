package repositories_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
)

func setupUserRepo(t *testing.T) (*repositories.UserRepository, *sql.DB) {
	t.Helper()
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	return repositories.NewUserRepository(db), db
}

func TestCreate_DuplicateUsername_ReturnsErrUsernameTaken(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	if _, err := repo.Create(ctx, &entities.User{Username: "alice", Name: "Alice"}); err != nil {
		t.Fatalf("first create: %v", err)
	}

	// Simulates the register race: FindByUsername passed, but the UNIQUE
	// index fires on insert.
	_, err := repo.Create(ctx, &entities.User{Username: "alice", Name: "Alice Clone"})
	if !errors.Is(err, repositories.ErrUsernameTaken) {
		t.Fatalf("expected ErrUsernameTaken, got %v", err)
	}
}

func TestUpdateUsername_Duplicate_ReturnsErrUsernameTaken(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	alice, err := repo.Create(ctx, &entities.User{Username: "alice", Name: "Alice"})
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob, err := repo.Create(ctx, &entities.User{Username: "bob", Name: "Bob"})
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}

	err = repo.UpdateUsername(ctx, bob.ID, "alice")
	if !errors.Is(err, repositories.ErrUsernameTaken) {
		t.Fatalf("expected ErrUsernameTaken, got %v", err)
	}

	// alice's username must be untouched
	aliceAfter, err := repo.FindByID(ctx, alice.ID)
	if err != nil {
		t.Fatalf("find alice: %v", err)
	}
	if aliceAfter.Username != "alice" {
		t.Fatalf("expected alice unchanged, got %q", aliceAfter.Username)
	}
}

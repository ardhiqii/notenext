package repositories_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
)

const expiresAtLayout = "2006-01-02 15:04:05"

func setupRefreshTokenRepo(t *testing.T) (*repositories.RefreshTokenRepository, *sql.DB, string) {
	t.Helper()
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}

	userRepo := repositories.NewUserRepository(db)
	user, err := userRepo.Create(context.Background(), &entities.User{
		Username:     "alice",
		Name:         "Alice",
		PasswordHash: "hash",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	return repositories.NewRefreshTokenRepository(db), db, user.ID
}

func seedRefreshToken(t *testing.T, db *sql.DB, userID, tokenHash, expiresAt string) {
	t.Helper()
	rt := &entities.RefreshToken{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
	}
	if _, err := repositories.NewRefreshTokenRepository(db).Create(context.Background(), rt); err != nil {
		t.Fatalf("create refresh token: %v", err)
	}
}

func TestFindByTokenHash_ValidToken_ReturnsUserID(t *testing.T) {
	repo, db, userID := setupRefreshTokenRepo(t)
	seedRefreshToken(t, db, userID, "hash-valid", time.Now().UTC().Add(24*time.Hour).Format(expiresAtLayout))

	got, err := repo.FindByTokenHash(context.Background(), "hash-valid")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if got != userID {
		t.Fatalf("expected userID %q, got %q", userID, got)
	}
}

func TestFindByTokenHash_ExpiredToken_ReturnsNotFound(t *testing.T) {
	repo, db, userID := setupRefreshTokenRepo(t)
	// Seed in UTC to match how the service writes expires_at (the DATETIME
	// column is read back by the driver as UTC).
	seedRefreshToken(t, db, userID, "hash-expired", time.Now().UTC().Add(-time.Hour).Format(expiresAtLayout))

	_, err := repo.FindByTokenHash(context.Background(), "hash-expired")
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Fatalf("expected NotFound for expired token, got %v", err)
	}
}

func TestFindByTokenHash_MissingToken_ReturnsNotFound(t *testing.T) {
	repo, _, _ := setupRefreshTokenRepo(t)

	_, err := repo.FindByTokenHash(context.Background(), "hash-does-not-exist")
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Fatalf("expected NotFound, got %v", err)
	}
}

func TestFindByTokenHash_UnparseableExpiry_FailsClosed(t *testing.T) {
	repo, db, userID := setupRefreshTokenRepo(t)
	seedRefreshToken(t, db, userID, "hash-garbage", "not-a-date")

	_, err := repo.FindByTokenHash(context.Background(), "hash-garbage")
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Fatalf("expected NotFound for unparseable expiry, got %v", err)
	}
}

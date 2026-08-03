package repositories

import (
	"context"
	"database/sql"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type RefreshTokenRepository struct {
	db database.DBTX
}

func NewRefreshTokenRepository(db database.DBTX) *RefreshTokenRepository {
	return &RefreshTokenRepository{
		db,
	}
}

func (r *RefreshTokenRepository) Create(ctx context.Context, refreshToken *entities.RefreshToken) (*entities.RefreshToken, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	refreshToken.ID = uuid.NewString()
	query := `
	INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)
	`
	_, err := r.db.ExecContext(ctx, query, refreshToken.ID, refreshToken.UserID, refreshToken.TokenHash, refreshToken.ExpiresAt)

	if err != nil {
		return nil, err
	}

	return refreshToken, nil

}

func (r *RefreshTokenRepository) FindByTokenHash(ctx context.Context, refreshToken string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	SELECT user_id, expires_at
	FROM refresh_tokens
	WHERE token_hash = $1
	`
	var userID, expiresAt string
	err := r.db.QueryRowContext(ctx, query, refreshToken).Scan(&userID, &expiresAt)
	if err == sql.ErrNoRows {
		return "", RepoErrors.NotFound
	}
	if err != nil {
		return "", err
	}

	// The driver (modernc.org/sqlite) normalizes the DATETIME column to an
	// RFC3339 string (e.g. "2026-08-05T00:21:53Z") on read, even though it is
	// written as "2006-01-02 15:04:05". Accept both layouts and compare in Go
	// against time.Now() (instant-based, timezone-agnostic). A missing or
	// unparseable expiry is treated as expired (fail closed).
	var expiry time.Time
	if t, parseErr := time.Parse(time.RFC3339, expiresAt); parseErr == nil {
		expiry = t
	} else if t, parseErr := time.Parse("2006-01-02 15:04:05", expiresAt); parseErr == nil {
		expiry = t
	} else {
		return "", RepoErrors.NotFound
	}
	if time.Now().After(expiry) {
		return "", RepoErrors.NotFound
	}

	return userID, nil
}

func (r *RefreshTokenRepository) DeleteRefreshTokenByUserID(ctx context.Context, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	DELETE FROM refresh_tokens
	WHERE user_id = ?
	`

	_, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return err
	}
	return nil
}

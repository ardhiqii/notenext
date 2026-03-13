package repositories

import (
	"context"

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
	INSERT INTO refresh_token (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)
	`
	_, err := r.db.ExecContext(ctx, query, refreshToken.ID, refreshToken.UserID, refreshToken.TokenHash, refreshToken.ExpiresAt)

	if err != nil {
		return nil, err
	}

	return refreshToken, nil

}

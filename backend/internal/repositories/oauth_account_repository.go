package repositories

import (
	"context"
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type OAuthAccountRepository struct {
	db database.DBTX
}

func NewOAuthAccountRepository(db database.DBTX) *OAuthAccountRepository {
	return &OAuthAccountRepository{
		db,
	}
}

func (r *OAuthAccountRepository) Create(ctx context.Context, oauthAccount *entities.OAuthAccount) (*entities.OAuthAccount, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	oauthAccount.ID = uuid.NewString()
	query := `
		INSERT INTO oauth_accounts (id,user_id,provider,provider_id) VALUES (?,?,?,?)
		`
	_, err := r.db.ExecContext(ctx, query, oauthAccount.ID, oauthAccount.UserID, oauthAccount.Provider, oauthAccount.ProviderID)
	if err != nil {
		return nil, err
	}
	return oauthAccount, nil

}

func (r *OAuthAccountRepository) FindByProviderID(ctx context.Context, provider string, providerId string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	var userId string
	query := `
	SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, provider, providerId)
	err := row.Scan(&userId)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return userId, nil

}

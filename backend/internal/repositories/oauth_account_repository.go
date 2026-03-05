package repositories

import "database/sql"

type OAuthAccountRepository struct {
	db *sql.DB
}

func NewOAuthAccountRepository(db *sql.DB) *OAuthAccountRepository {
	return &OAuthAccountRepository{
		db,
	}
}
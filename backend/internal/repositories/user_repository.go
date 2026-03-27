package repositories

import (
	"context"
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type UserRepository struct {
	db database.DBTX
}

func NewUserRepository(db database.DBTX) *UserRepository {
	return &UserRepository{db}
}

func (r *UserRepository) Create(ctx context.Context, user *entities.User) (*entities.User, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	user.ID = uuid.NewString()
	query := `
	INSERT INTO users (id,email,name,avatar_url) VALUES(?,?,?,?)
	`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Email, user.Name, user.AvatarURL)
	if err != nil {
		return nil, err
	}

	return user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, userID string) (*entities.User, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	user := &entities.User{
		ID: userID,
	}

	query := `
	SELECT email,name,avatar_url 
	FROM users 
	WHERE id = $1
	`
	row := r.db.QueryRowContext(ctx, query, userID)
	err := row.Scan(&user.Email, &user.Name, &user, user.AvatarURL)
	if err == sql.ErrNoRows{
		return nil, 
	}
	if err != nil {
		return nil, err
	}
	return user, nil
}

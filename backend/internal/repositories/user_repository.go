package repositories

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

// ErrUsernameTaken is returned when a username UNIQUE constraint is violated
// (e.g. two concurrent registrations with the same username), so callers can
// map it to a clean 409 instead of surfacing a raw SQLite error.
var ErrUsernameTaken = errors.New("username already taken")

func isUsernameUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed: users.username")
}

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

	// Convert empty strings to NULL for unique fields
	var email, avatarURL any
	if user.Email != "" {
		email = user.Email
	} else {
		email = nil
	}
	if user.AvatarURL != "" {
		avatarURL = user.AvatarURL
	} else {
		avatarURL = nil
	}

	query := `
	INSERT INTO users (id, username, email, name, avatar_url, password_hash) VALUES(?,?,?,?,?,?)
	`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Username, email, user.Name, avatarURL, user.PasswordHash)
	if err != nil {
		if isUsernameUniqueViolation(err) {
			return nil, ErrUsernameTaken
		}
		return nil, err
	}

	return user, nil
}

func (r *UserRepository) FindByUsername(ctx context.Context, username string) (*entities.User, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	user := &entities.User{}
	query := `
	SELECT id, username, email, name, avatar_url, password_hash
	FROM users
	WHERE username = $1
	`
	var email, avatarURL, passwordHash sql.NullString
	row := r.db.QueryRowContext(ctx, query, username)
	err := row.Scan(&user.ID, &user.Username, &email, &user.Name, &avatarURL, &passwordHash)
	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}
	if err != nil {
		return nil, err
	}

	user.Email = email.String
	user.AvatarURL = avatarURL.String
	user.PasswordHash = passwordHash.String
	return user, nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*entities.User, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	user := &entities.User{}
	query := `
	SELECT id, username, email, name, avatar_url, password_hash
	FROM users
	WHERE email = $1
	`
	var username, avatarURL, passwordHash sql.NullString
	row := r.db.QueryRowContext(ctx, query, email)
	err := row.Scan(&user.ID, &username, &user.Email, &user.Name, &avatarURL, &passwordHash)
	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}
	if err != nil {
		return nil, err
	}

	user.Username = username.String
	user.AvatarURL = avatarURL.String
	user.PasswordHash = passwordHash.String
	return user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, userID string) (*entities.User, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	user := &entities.User{
		ID: userID,
	}

	var username, email, avatarURL, passwordHash, lastSeenChangelogVersion sql.NullString

	query := `
	SELECT username, email, name, avatar_url, password_hash, last_seen_changelog_version
	FROM users
	WHERE id = $1
	`
	row := r.db.QueryRowContext(ctx, query, userID)
	err := row.Scan(&username, &email, &user.Name, &avatarURL, &passwordHash, &lastSeenChangelogVersion)
	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}

	if err != nil {
		return nil, err
	}

	user.Username = username.String
	user.Email = email.String
	user.AvatarURL = avatarURL.String
	user.PasswordHash = passwordHash.String
	user.LastSeenChangelogVersion = lastSeenChangelogVersion.String

	return user, nil
}

func (r *UserRepository) UpdatePasswordHash(ctx context.Context, userID string, passwordHash string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, passwordHash, userID)
	return err
}

func (r *UserRepository) UpdateUsername(ctx context.Context, userID string, username string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, username, userID)
	if err != nil {
		if isUsernameUniqueViolation(err) {
			return ErrUsernameTaken
		}
		return err
	}
	return nil
}

func (r *UserRepository) UpdateLastSeenChangelogVersion(ctx context.Context, userID string, version string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	UPDATE users SET last_seen_changelog_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, version, userID)
	return err
}

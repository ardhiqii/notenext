package repositories

import (
	"context"
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type NoteRepository struct {
	db *sql.DB
}

func NewNoteRepository(db *sql.DB) *NoteRepository {
	return &NoteRepository{db}
}

func (n *NoteRepository) Create(ctx context.Context, note *entities.Note) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	INSERT INTO notes (title, content, position_at) VALUES (?, ?, ?)
	RETURNING created_at, updated_at
	`
	err := n.db.QueryRowContext(ctx, query, note.Title, note.Content, note.PositionAt).Scan( &note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return err
	}
	note.ID = uuid.NewString()

	return nil
}

func (n *NoteRepository) GetLastPositionAt(ctx context.Context) (*int64, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	var positionAt int64
	query := `
	SELECT COALESCE(MAX(position_at), 0) + 1 FROM notes
	`
	err := n.db.QueryRowContext(ctx, query).Scan(&positionAt)
	if err != nil {
		return nil, err
	}
	return &positionAt, nil
}

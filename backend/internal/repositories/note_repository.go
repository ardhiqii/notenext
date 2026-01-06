package repositories

import (
	"context"
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
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

	note.ID = uuid.NewString()

	query := `
	INSERT INTO notes (id,title, content, position_at) VALUES (?,?, ?, ?)
	RETURNING created_at, updated_at
	`
	err := n.db.QueryRowContext(ctx, query, note.ID, note.Title, note.Content, note.PositionAt).Scan(&note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return err
	}

	return nil
}

func (n *NoteRepository) GetAll(ctx context.Context) ([]*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	SELECT id, title, content, position_at, created_at, updated_at FROM notes ORDER BY position_at ASC`
	rows, err := n.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := make([]*entities.Note, 0)
	for rows.Next() {
		var note entities.Note
		err := rows.Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.CreatedAt, &note.UpdatedAt)
		if err != nil {
			return nil, err
		}
		notes = append(notes, &note)
	}

	return notes, nil
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

func (n *NoteRepository) UpdateContent(ctx context.Context, note *dtos.UpdateContentNoteRequest) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	UPDATE notes
	SET content = $2, updated_at = CURRENT_TIMESTAMP
	WHERE id = $1
	`

	_, err := n.db.QueryContext(ctx, query, note.ID, note.Content)
	if err != nil {
		return err
	}

	return nil

}

func (n *NoteRepository) Delete(ctx context.Context, req *dtos.DeleteNoteRequest) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	DELETE FROM notes
	WHERE id = $1
	`
	_, err := n.db.QueryContext(ctx, query, req.ID)
	if err != nil {
		return err
	}
	return nil
}

func (n *NoteRepository) GetById(ctx context.Context, req *dtos.GetNoteRequest) (*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var note entities.Note

	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE id = $1
	`

	err := n.db.QueryRowContext(ctx, query, req.ID).Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &note, nil

}

func (n *NoteRepository) UpdateTabPosition(ctx context.Context, req *dtos.UpdateTabPositionRequest) error {
	ctx,cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	UPDATE notes
	WHERE id = $1
	SET position_at = $2
	`

	_,err := n.db.QueryContext(ctx,query, req.ID, req.PositionAt)
	if err != nil {
		return err
	}
	
	
	return nil
}
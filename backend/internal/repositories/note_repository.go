package repositories

import (
	"context"
	"database/sql"
	"fmt"

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

func (r *NoteRepository) Create(ctx context.Context, userID string, note *entities.Note) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	note.ID = uuid.NewString()
	var args []any

	args = append(args, note.ID, note.Title, note.Content, note.PositionAt)
	query := `
	INSERT INTO notes (id,title, content, position_at) VALUES (?,?, ?, ?)
	RETURNING created_at, updated_at
	`
	if userID != "" {
		query = `
		INSERT INTO notes (id,title, content, position_at,user_id) VALUES (?,?, ?, ?, ?)
	RETURNING created_at, updated_at
		`
		args = append(args, userID)
	}

	err := r.db.QueryRowContext(ctx, query, args...).Scan(&note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return err
	}

	return nil
}

func (r *NoteRepository) GetAll(ctx context.Context, userID string) ([]*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any

	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE user_id IS NULL
	ORDER BY position_at ASC`

	if userID != "" {
		query = `
		SELECT id, title, content, position_at, created_at, updated_at 
		FROM notes 
		WHERE user_id = ? 
		ORDER BY position_at ASC`
		args = append(args, userID)
	}
	rows, err := r.db.QueryContext(ctx, query, args...)
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

func (r *NoteRepository) GetLastPositionAt(ctx context.Context, userID string) (*int64, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	var positionAt int64
	query := `
	SELECT COALESCE(MAX(position_at), 0) + 1 FROM notes
	`
	err := r.db.QueryRowContext(ctx, query).Scan(&positionAt)
	if err != nil {
		return nil, err
	}
	return &positionAt, nil
}

func (r *NoteRepository) UpdateNote(ctx context.Context, req *dtos.UpdateNoteRequest) error {
	if req.Title == nil && req.Content == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	UPDATE notes
	SET `
	args := []any{}
	argsIndex := 1

	if req.Title != nil {
		query += fmt.Sprintf("title = $%d", argsIndex)
		args = append(args, *req.Title)
		argsIndex++
	}

	if req.Content != nil {
		if argsIndex > 1 {
			query += ", "
		}
		query += fmt.Sprintf("content = $%d", argsIndex)
		args = append(args, *req.Content)
		argsIndex++
	}

	query += fmt.Sprintf(", updated_at = CURRENT_TIMESTAMP where id = $%d", argsIndex)
	args = append(args, req.ID)

	_, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}

	return nil

}

func (r *NoteRepository) Delete(ctx context.Context, req *dtos.DeleteNoteRequest) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	DELETE FROM notes
	WHERE id = $1
	`
	_, err := r.db.QueryContext(ctx, query, req.ID)
	if err != nil {
		return err
	}
	return nil
}

func (r *NoteRepository) GetById(ctx context.Context, userID string, req *dtos.GetNoteRequest) (*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var note entities.Note
	var args []any

	args = append(args, req.ID)
	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE id = $1 and user_id IS NULL
	`
	if userID != "" {
		query = `
		SELECT id, title, content, position_at, created_at, updated_at 
		FROM notes
		WHERE id = $1 and user_id = $2
		`
		args = append(args, userID)
	}

	row := r.db.QueryRowContext(ctx, query, args...)
	err := row.Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.CreatedAt, &note.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}
	if err != nil {
		return nil, err
	}
	return &note, nil

}

func (r *NoteRepository) GetByIds(ctx context.Context, ids []string) ([]*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	if len(ids) == 0 {
		return []*entities.Note{}, nil
	}

	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE id IN (`

	args := make([]any, len(ids))
	for i, id := range ids {
		if i > 0 {
			query += ", "
		}
		query += fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	query += ")"

	rows, err := r.db.QueryContext(ctx, query, args...)
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

func (r *NoteRepository) UpdateTabPosition(ctx context.Context, req *dtos.UpdateTabPositionRequest) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `
	UPDATE notes
	WHERE id = $1
	SET position_at = $2
	`

	_, err := r.db.QueryContext(ctx, query, req.ID, req.PositionAt)
	if err != nil {
		return err
	}

	return nil
}

func (r *NoteRepository) CountByUserID(ctx context.Context, userID string) (int32, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any
	var count int32

	query := `
	SELECT COUNT(*)
	FROM notes
	WHERE user_id IS NULL
	`
	if userID != "" {
		query = `
		SELECT COUNT(*)
		FROM notes
		WHERE user_id = ?
		`
		args = append(args, userID)
	}

	row := r.db.QueryRowContext(ctx, query, args...)
	err := row.Scan(&count)

	if err != nil {
		return 0, err
	}

	return count, nil
}

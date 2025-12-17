package repositories

import (
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/entities"
)

type NoteRepository struct {
	db *sql.DB
}

func NewNoteRepository(db *sql.DB) *NoteRepository {
	return &NoteRepository{db}
}

func (n *NoteRepository) Create() (*entities.Note, error) {
	return nil, nil
}

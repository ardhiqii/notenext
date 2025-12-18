package services

import (
	"context"
	"strconv"

	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
)

type NoteService struct {
	noteRepo *repositories.NoteRepository
}

func NewNoteService(noteRepo *repositories.NoteRepository) *NoteService {
	return &NoteService{
		noteRepo,
	}
}

func (n *NoteService) CreateNote(ctx context.Context) (*dtos.CreateNoteResponse, error) {
	positionAt, err := n.noteRepo.GetLastPositionAt(ctx)
	if err != nil {
		return nil, err
	}

	defaultTitle := "new " + strconv.FormatInt(*positionAt, 10)

	note := &entities.Note{
		Title:      defaultTitle,
		Content:    "",
		PositionAt: *positionAt,
	}

	err = n.noteRepo.Create(ctx, note)
	if err != nil {
		return nil, err
	}

	resp := dtos.NewCreateNoteResponse(note.ID, note.Title, note.Content, note.PositionAt)
	return resp, nil

}

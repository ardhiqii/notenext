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

func (n *NoteService) GetAllNotes(ctx context.Context) ([]*dtos.NoteResponse, error) {
	data, err := n.noteRepo.GetAll(ctx)
	if err != nil {
		return nil, err
	}
	notes := make([]*dtos.NoteResponse, 0)
	for _,n := range data{
		
		note := dtos.NewNoteResponse(n.ID,n.Title, n.Content, n.PositionAt)
		notes = append(notes,note)		
	}
	return notes, nil
}

func (n *NoteService) UpdateNoteContent(ctx context.Context, noteReq *dtos.UpdateContentNoteRequest ) error{
	err := n.noteRepo.UpdateContent(ctx,noteReq); if err != nil{
		return err
	}
	return nil
}
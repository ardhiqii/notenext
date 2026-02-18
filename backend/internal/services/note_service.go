package services

import (
	"context"
	"time"

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

	defaultTitle := "New note"

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
	for _, n := range data {

		note := dtos.NewNoteResponse(n.ID, n.Title, n.Content, n.PositionAt)
		notes = append(notes, note)
	}
	if len(notes) == 0 {
		data, err := n.CreateNote(ctx)
		if err != nil {
			return nil, err
		}
		note := dtos.NewNoteResponse(data.ID, data.Title, data.Content, data.PositionAt)
		notes = append(notes, note)

	}
	return notes, nil
}

func (n *NoteService) GetNoteById(ctx context.Context, req *dtos.GetNoteRequest) (*dtos.GetNoteResponse, error) {
	data, err := n.noteRepo.GetById(ctx, req)
	if err != nil {
		return nil, err
	}
	note := dtos.GetNoteResponse{
		ID:         data.ID,
		Title:      data.Title,
		Content:    data.Content,
		PositionAt: data.PositionAt,
	}
	return &note, nil
}

func (n *NoteService) UpdateNote(ctx context.Context, req *dtos.UpdateNoteRequest) error {
	if err := n.noteRepo.UpdateNote(ctx, req); err != nil {
		return err
	}
	return nil
}

func (n *NoteService) DeleteNote(ctx context.Context, req *dtos.DeleteNoteRequest) error {
	if err := n.noteRepo.Delete(ctx, req); err != nil {
		return err
	}
	return nil
}

func (n *NoteService) GetAllOnlyTabs(ctx context.Context) ([]*dtos.TabResponse, error) {
	data, err := n.GetAllNotes(ctx)
	if err != nil {
		return nil, err
	}
	tabs := make([]*dtos.TabResponse, 0)
	for _, n := range data {
		tab := dtos.TabResponse{
			ID:         n.ID,
			Title:      n.Title,
			PositionAt: n.PositionAt,
		}
		tabs = append(tabs, &tab)
	}
	return tabs, nil
}

func (n *NoteService) ExportNoteById(ctx context.Context, req *dtos.GetNoteRequest) (*dtos.ExportNoteResponse, error) {
	data, err := n.noteRepo.GetById(ctx, req)
	if err != nil {
		return nil, err
	}

	noteExport := dtos.NoteExport{
		ID:         data.ID,
		Title:      data.Title,
		Content:    data.Content,
		PositionAt: data.PositionAt,
	}

	resp := &dtos.ExportNoteResponse{
		Version:    "1.0",
		ExportedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		Notes:      []dtos.NoteExport{noteExport},
	}

	return resp, nil
}

func (n *NoteService) ExportAllNotes(ctx context.Context) (*dtos.ExportNoteResponse, error) {
	notes, err := n.noteRepo.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	noteExports := make([]dtos.NoteExport, 0, len(notes))
	for _, note := range notes {
		noteExports = append(noteExports, dtos.NoteExport{
			ID:         note.ID,
			Title:      note.Title,
			Content:    note.Content,
			PositionAt: note.PositionAt,
		})
	}

	resp := &dtos.ExportNoteResponse{
		Version:    "1.0",
		ExportedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		Notes:      noteExports,
	}

	return resp, nil
}

func (n *NoteService) ImportNotes(ctx context.Context, req *dtos.ImportNotesRequest) (*dtos.ImportNotesResponse, error) {
	if req.Notes == nil || len(req.Notes) == 0 {
		return &dtos.ImportNotesResponse{
			Imported: 0,
			Skipped:  0,
			NoteIds:  []string{},
		}, nil
	}

	positionAt, err := n.noteRepo.GetLastPositionAt(ctx)
	if err != nil {
		return nil, err
	}

	var noteIds []string
	imported := 0
	skipped := 0

	for i, importNote := range req.Notes {
		if importNote.Title == "" {
			skipped++
			continue
		}

		note := &entities.Note{
			Title:      importNote.Title,
			Content:    importNote.Content,
			PositionAt: *positionAt + int64(i+1),
		}

		err = n.noteRepo.Create(ctx, note)
		if err != nil {
			skipped++
			continue
		}

		noteIds = append(noteIds, note.ID)
		imported++
	}

	return &dtos.ImportNotesResponse{
		Imported: imported,
		Skipped:  skipped,
		NoteIds:  noteIds,
	}, nil
}

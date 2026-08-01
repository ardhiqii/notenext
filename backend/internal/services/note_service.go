package services

import (
	"context"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
)

type NoteService struct {
	noteRepo     *repositories.NoteRepository
	tabGroupRepo repositories.TabGroupRepoInterface
}

func NewNoteService(noteRepo *repositories.NoteRepository, tabGroupRepo repositories.TabGroupRepoInterface) *NoteService {
	return &NoteService{
		noteRepo:     noteRepo,
		tabGroupRepo: tabGroupRepo,
	}
}

func (s *NoteService) CreateNote(ctx context.Context, userID string, groupID *string) (*dtos.CreateNoteResponse, error) {
	if groupID != nil && *groupID != "" {
		// Guests cannot create notes inside a group (no owned groups exist).
		if userID == "" {
			return nil, repositories.RepoErrors.NotFound
		}
		if _, err := s.tabGroupRepo.GetByID(ctx, userID, *groupID); err != nil {
			return nil, err
		}
	}

	if userID == "" {
		count, err := s.noteRepo.CountByUserID(ctx, userID)
		if err != nil {
			return nil, err
		}
		if count >= 3 {
			return nil, repositories.RepoErrors.LimitReached
		}
	}

	positionAt, err := s.noteRepo.GetLastPositionAt(ctx, userID)
	if err != nil {
		return nil, err
	}

	defaultTitle := "New note"

	note := &entities.Note{
		Title:      defaultTitle,
		Content:    "",
		PositionAt: *positionAt,
		UserID:     &userID,
		GroupID:    groupID,
	}

	err = s.noteRepo.Create(ctx, userID, note)
	if err != nil {
		return nil, err
	}

	resp := dtos.NewCreateNoteResponse(note.ID, note.Title, note.Content, note.PositionAt)
	return resp, nil

}

func (s *NoteService) GetAllNotes(ctx context.Context, userID string) ([]*dtos.NoteResponse, error) {
	data, err := s.noteRepo.GetAll(ctx, userID)
	if err != nil {
		return nil, err
	}
	notes := make([]*dtos.NoteResponse, 0)
	for _, n := range data {

		note := dtos.NewNoteResponse(n.ID, n.Title, n.Content, n.PositionAt)
		notes = append(notes, note)
	}
	return notes, nil
}

func (s *NoteService) GetNoteById(ctx context.Context, userID string, req *dtos.GetNoteRequest) (*dtos.GetNoteResponse, error) {
	data, err := s.noteRepo.GetById(ctx, userID, req)
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

func (s *NoteService) UpdateNote(ctx context.Context,userID string, req *dtos.UpdateNoteRequest) error {
	if err := s.noteRepo.UpdateNote(ctx, userID,req); err != nil {
		return err
	}
	return nil
}

func (s *NoteService) DeleteNote(ctx context.Context, req *dtos.DeleteNoteRequest) error {
	if err := s.noteRepo.Delete(ctx, req); err != nil {
		return err
	}
	return nil
}

func (s *NoteService) UpdateTabPosition(ctx context.Context, req *dtos.UpdateTabPositionRequest) error {
	if err := s.noteRepo.UpdateTabPosition(ctx, req); err != nil {
		return err
	}
	return nil
}

func (s *NoteService) GetAllOnlyTabs(ctx context.Context, userID string) ([]*dtos.TabResponse, error) {
	data, err := s.GetAllNotes(ctx, userID)
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

func (s *NoteService) AssignNoteToGroup(ctx context.Context, userID, noteID string, groupID *string) error {
	return s.noteRepo.AssignNoteToGroup(ctx, userID, noteID, groupID)
}

func (s *NoteService) ReorderTabsInGroup(ctx context.Context, userID, groupID string, tabIDs []string) error {
	return s.noteRepo.ReorderTabsInGroup(ctx, userID, groupID, tabIDs)
}

func (s *NoteService) ExportNoteById(ctx context.Context, userID string, req *dtos.GetNoteRequest) (*dtos.ExportNoteResponse, error) {
	data, err := s.noteRepo.GetById(ctx, userID, req)
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
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:      []dtos.NoteExport{noteExport},
	}

	return resp, nil
}

func (s *NoteService) ExportAllNotes(ctx context.Context, userID string) (*dtos.ExportNoteResponse, error) {
	notes, err := s.noteRepo.GetAll(ctx, userID)
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
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:      noteExports,
	}

	return resp, nil
}

func (s *NoteService) ExportNotesByIds(ctx context.Context, req *dtos.ExportNotesRequest) (*dtos.ExportNoteResponse, error) {
	if len(req.NoteIds) == 0 {
		return &dtos.ExportNoteResponse{
			Version:    "1.0",
			ExportedAt: time.Now().UTC().Format(time.RFC3339),
			Notes:      []dtos.NoteExport{},
		}, nil
	}

	notes, err := s.noteRepo.GetByIds(ctx, req.NoteIds)
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
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:      noteExports,
	}

	return resp, nil
}

func (s *NoteService) ImportNotes(ctx context.Context, userID string, req *dtos.ImportNotesRequest) (*dtos.ImportNotesResponse, error) {
	if req.Notes == nil || len(req.Notes) == 0 {
		return &dtos.ImportNotesResponse{
			Imported: 0,
			Skipped:  0,
			NoteIds:  []string{},
		}, nil
	}

	positionAt, err := s.noteRepo.GetLastPositionAt(ctx, userID)
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

		err = s.noteRepo.Create(ctx, userID, note)
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

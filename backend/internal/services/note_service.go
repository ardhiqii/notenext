package services

import (
	"context"
	"database/sql"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
)

type NoteService struct {
	db           *sql.DB
	noteRepo     *repositories.NoteRepository
	tabGroupRepo repositories.TabGroupRepoInterface
}

func NewNoteService(db *sql.DB, noteRepo *repositories.NoteRepository, tabGroupRepo repositories.TabGroupRepoInterface) *NoteService {
	return &NoteService{
		db:           db,
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

	// Compute the next position and INSERT inside ONE transaction. The old
	// code did GetLastPositionAt() then Create() as two separate statements —
	// two concurrent creates could both read MAX(position_at)+1 and produce
	// duplicate positions (tied sidebar order). SQLite serializes writers via
	// its busy timeout, so the transaction makes read+write atomic.
	var resp *dtos.CreateNoteResponse
	err := database.WithTx(s.db, ctx, func(tx *sql.Tx) error {
		positionAt, err := s.noteRepo.GetLastPositionAtInTx(ctx, tx, userID)
		if err != nil {
			return err
		}

		defaultTitle := "New note"

		note := &entities.Note{
			Title:      defaultTitle,
			Content:    "",
			PositionAt: *positionAt,
			UserID:     &userID,
			GroupID:    groupID,
		}

		if err = s.noteRepo.CreateInTx(ctx, tx, userID, note); err != nil {
			return err
		}

		resp = dtos.NewCreateNoteResponse(note.ID, note.Title, note.Content, note.PositionAt, note.GroupID)
		return nil
	})
	if err != nil {
		return nil, err
	}

	return resp, nil

}

func (s *NoteService) GetAllNotes(ctx context.Context, userID string) ([]*dtos.NoteResponse, error) {
	data, err := s.noteRepo.GetAll(ctx, userID)
	if err != nil {
		return nil, err
	}
	notes := make([]*dtos.NoteResponse, 0)
	for _, n := range data {

		note := dtos.NewNoteResponse(n.ID, n.Title, n.Content, n.PositionAt, n.GroupID)
		notes = append(notes, note)
	}
	return notes, nil
}

// SearchNotes returns up to 20 notes matching q in title or content.
// Guests (userID == "") only match global notes; logged-in users match their
// own notes plus global ones. NULL group fields map to nil pointers so they
// serialize as null in the response.
func (s *NoteService) SearchNotes(ctx context.Context, userID, q string) ([]*dtos.SearchNoteResponse, error) {
	const searchLimit = 20
	results, err := s.noteRepo.SearchNotes(ctx, userID, q, searchLimit)
	if err != nil {
		return nil, err
	}

	resp := make([]*dtos.SearchNoteResponse, 0, len(results))
	for _, r := range results {
		resp = append(resp, &dtos.SearchNoteResponse{
			ID:             r.ID,
			Title:          r.Title,
			ContentSnippet: r.ContentSnippet,
			PositionAt:     r.PositionAt,
			GroupID:        r.GroupID,
			GroupName:      r.GroupName,
		})
	}
	return resp, nil
}

// GetPublicNotes returns global/public notes (user_id IS NULL) — the seeded
// notes accessible to everyone, including logged-in users.
func (s *NoteService) GetPublicNotes(ctx context.Context) ([]*dtos.NoteResponse, error) {
	data, err := s.noteRepo.GetAllPublic(ctx)
	if err != nil {
		return nil, err
	}
	notes := make([]*dtos.NoteResponse, 0, len(data))
	for _, n := range data {
		notes = append(notes, dtos.NewNoteResponse(n.ID, n.Title, n.Content, n.PositionAt, n.GroupID))
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

func (s *NoteService) UpdateNote(ctx context.Context, userID string, req *dtos.UpdateNoteRequest) error {
	if err := s.noteRepo.UpdateNote(ctx, userID, req); err != nil {
		return err
	}
	return nil
}

func (s *NoteService) DeleteNote(ctx context.Context, userID string, req *dtos.DeleteNoteRequest) error {
	if err := s.noteRepo.Delete(ctx, userID, req); err != nil {
		return err
	}
	return nil
}

func (s *NoteService) UpdateTabPosition(ctx context.Context, userID string, req *dtos.UpdateTabPositionRequest) error {
	if err := s.noteRepo.UpdateTabPosition(ctx, userID, req); err != nil {
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
			GroupID:    n.GroupID,
		}
		tabs = append(tabs, &tab)
	}
	return tabs, nil
}

func (s *NoteService) AssignNoteToGroup(ctx context.Context, userID, noteID string, groupID *string) error {
	// Mirror CreateNote's ownership check: the target group must belong to
	// the caller. Without it, PATCH /tabs/{note}/group with someone else's
	// group_id returned 200 and the note silently disappeared from the
	// user's sidebar (it only rendered inside a group the user cannot see).
	if groupID != nil && *groupID != "" {
		if _, err := s.tabGroupRepo.GetByID(ctx, userID, *groupID); err != nil {
			return err
		}
	}
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

func (s *NoteService) ExportNotesByIds(ctx context.Context, userID string, req *dtos.ExportNotesRequest) (*dtos.ExportNoteResponse, error) {
	if len(req.NoteIds) == 0 {
		return &dtos.ExportNoteResponse{
			Version:    "1.0",
			ExportedAt: time.Now().UTC().Format(time.RFC3339),
			Notes:      []dtos.NoteExport{},
		}, nil
	}

	notes, err := s.noteRepo.GetByIds(ctx, userID, req.NoteIds)
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

	// Count + create inside ONE transaction: the old code checked the guest
	// cap and then created note-by-note, so two concurrent imports could both
	// read the count before either inserted — slipping past the limit
	// (TOCTOU). WithTx + busy timeout serializes the whole batch.
	noteIds := []string{}
	imported := 0
	skipped := 0
	err := database.WithTx(s.db, ctx, func(tx *sql.Tx) error {
		// Guests are capped at 3 notes total (same limit as CreateNote) — the
		// import endpoint must not let them bypass it by importing in bulk.
		if userID == "" {
			count, err := s.noteRepo.CountByUserIDInTx(ctx, tx, userID)
			if err != nil {
				return err
			}
			if int(count)+len(req.Notes) > 3 {
				return repositories.RepoErrors.LimitReached
			}
		}

		positionAt, err := s.noteRepo.GetLastPositionAtInTx(ctx, tx, userID)
		if err != nil {
			return err
		}

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

			err = s.noteRepo.CreateInTx(ctx, tx, userID, note)
			if err != nil {
				skipped++
				continue
			}

			noteIds = append(noteIds, note.ID)
			imported++
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &dtos.ImportNotesResponse{
		Imported: imported,
		Skipped:  skipped,
		NoteIds:  noteIds,
	}, nil
}

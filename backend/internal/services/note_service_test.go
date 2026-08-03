package services_test

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
)

func newNoteService(t *testing.T) (*services.NoteService, *sql.DB) {
	t.Helper()
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	return services.NewNoteService(repositories.NewNoteRepository(db), repositories.NewTabGroupRepoInterface(db)), db
}

// insertNote seeds a note directly, bypassing repo.Create (which generates its
// own UUID) so tests can use deterministic IDs.
func insertNote(t *testing.T, db *sql.DB, id, userID, title string, position int64, groupID *string) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO notes (id, user_id, title, content, position_at, group_id) VALUES (?, ?, ?, '', ?, ?)`,
		id, testutil.NullIfEmpty(userID), title, position, groupID,
	)
	if err != nil {
		t.Fatalf("insert note %s: %v", id, err)
	}
}

func insertGroup(t *testing.T, db *sql.DB, id, userID, name string, position int64) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO tab_groups (id, user_id, name, position_at, collapsed) VALUES (?, ?, ?, ?, 0)`,
		id, testutil.NullIfEmpty(userID), name, position,
	)
	if err != nil {
		t.Fatalf("insert group %s: %v", id, err)
	}
}

func TestCreateNote_Success(t *testing.T) {
	svc, _ := newNoteService(t)

	resp, err := svc.CreateNote(context.Background(), "u1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID == "" {
		t.Error("expected non-empty note ID")
	}
	if resp.Title != "New note" {
		t.Errorf("expected default title %q, got %q", "New note", resp.Title)
	}
	if resp.PositionAt != 1 {
		t.Errorf("expected first position 1, got %d", resp.PositionAt)
	}
}

func TestCreateNote_GuestLimit(t *testing.T) {
	svc, db := newNoteService(t)
	// Guest = userID "" → notes with user_id IS NULL. Seed 3 to hit the cap.
	for i := 1; i <= 3; i++ {
		insertNote(t, db, "guest-note-"+string(rune('0'+i)), "", "Note", int64(i), nil)
	}

	resp, err := svc.CreateNote(context.Background(), "", nil)
	if err == nil {
		t.Fatalf("expected LimitReached error, got %+v", resp)
	}
	if !errors.Is(err, repositories.RepoErrors.LimitReached) {
		t.Errorf("expected LimitReached, got %v", err)
	}
}

func TestCreateNote_WithGroup(t *testing.T) {
	svc, db := newNoteService(t)
	insertGroup(t, db, "g1", "u1", "Work", 1)

	resp, err := svc.CreateNote(context.Background(), "u1", strPtr("g1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID == "" {
		t.Error("expected non-empty note ID")
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id = ?`, resp.ID).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID == nil || *groupID != "g1" {
		t.Errorf("expected note in group g1, got %v", groupID)
	}
}

func TestCreateNote_WithGroup_NotFound(t *testing.T) {
	svc, _ := newNoteService(t)

	resp, err := svc.CreateNote(context.Background(), "u1", strPtr("missing"))
	if err == nil {
		t.Fatalf("expected NotFound, got %+v", resp)
	}
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound, got %v", err)
	}
}

func TestCreateNote_WithGroup_AnotherUser(t *testing.T) {
	svc, db := newNoteService(t)
	insertGroup(t, db, "g1", "u2", "Private", 1)

	resp, err := svc.CreateNote(context.Background(), "u1", strPtr("g1"))
	if err == nil {
		t.Fatalf("expected NotFound, got %+v", resp)
	}
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound, got %v", err)
	}
}

func TestCreateNote_GuestWithGroup_Rejected(t *testing.T) {
	svc, db := newNoteService(t)
	insertGroup(t, db, "g1", "", "Public", 1)

	resp, err := svc.CreateNote(context.Background(), "", strPtr("g1"))
	if err == nil {
		t.Fatalf("expected NotFound, got %+v", resp)
	}
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound, got %v", err)
	}
}

func TestGetAllNotes_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "First", 3, nil)
	insertNote(t, db, "n2", "u1", "Second", 1, nil)
	insertNote(t, db, "n3", "u1", "Third", 2, nil)

	notes, err := svc.GetAllNotes(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(notes) != 3 {
		t.Fatalf("expected 3 notes, got %d", len(notes))
	}
	if notes[0].Title != "Second" || notes[1].Title != "Third" || notes[2].Title != "First" {
		t.Errorf("notes not sorted by position: %+v", notes)
	}
}

func TestGetNoteById_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "My note", 1, nil)

	resp, err := svc.GetNoteById(context.Background(), "u1", &dtos.GetNoteRequest{ID: "n1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID != "n1" || resp.Title != "My note" || resp.PositionAt != 1 {
		t.Errorf("unexpected note: %+v", resp)
	}
}

func TestGetNoteById_NotFound(t *testing.T) {
	svc, _ := newNoteService(t)

	resp, err := svc.GetNoteById(context.Background(), "u1", &dtos.GetNoteRequest{ID: "nope"})
	if err == nil {
		t.Fatalf("expected NotFound, got %+v", resp)
	}
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound, got %v", err)
	}
}

func TestUpdateNote_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "Old title", 1, nil)

	title := "New title"
	content := "New content"
	err := svc.UpdateNote(context.Background(), "u1", &dtos.UpdateNoteRequest{
		ID:      "n1",
		Title:   &title,
		Content: &content,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got, err := svc.GetNoteById(context.Background(), "u1", &dtos.GetNoteRequest{ID: "n1"})
	if err != nil {
		t.Fatalf("fetch after update: %v", err)
	}
	if got.Title != "New title" || got.Content != "New content" {
		t.Errorf("note not updated: %+v", got)
	}
}

func TestUpdateNote_RepoError(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "Old title", 1, nil)

	// Force the repository to fail by closing the underlying DB. The service
	// must propagate the repo error instead of swallowing it (a negated
	// `err == nil` check would silently return nil here).
	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	title := "New title"
	err := svc.UpdateNote(context.Background(), "u1", &dtos.UpdateNoteRequest{
		ID:    "n1",
		Title: &title,
	})
	if err == nil {
		t.Fatal("expected repo error to propagate, got nil")
	}
	if !strings.Contains(err.Error(), "database is closed") {
		t.Errorf("expected the repo's closed-DB error, got %v", err)
	}
}

func TestDeleteNote_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "To delete", 1, nil)

	err := svc.DeleteNote(context.Background(), "u1", &dtos.DeleteNoteRequest{ID: "n1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = svc.GetNoteById(context.Background(), "u1", &dtos.GetNoteRequest{ID: "n1"})
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound after delete, got %v", err)
	}
}

func TestDeleteNote_GlobalNoteProtected(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "pub1", "", "Public note", 1, nil)

	// A user must NOT be able to delete a global/public note (user_id NULL).
	err := svc.DeleteNote(context.Background(), "u1", &dtos.DeleteNoteRequest{ID: "pub1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The global note must still exist.
	_, err = svc.GetNoteById(context.Background(), "u1", &dtos.GetNoteRequest{ID: "pub1"})
	if err != nil {
		t.Errorf("expected global note to survive user delete, got %v", err)
	}
}

func TestDeleteNote_RepoError(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "To delete", 1, nil)

	// Force the repository to fail by closing the underlying DB. The service
	// must propagate the repo error instead of swallowing it (a negated
	// `err == nil` check would silently return nil here).
	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	err := svc.DeleteNote(context.Background(), "u1", &dtos.DeleteNoteRequest{ID: "n1"})
	if err == nil {
		t.Fatal("expected repo error to propagate, got nil")
	}
	if !strings.Contains(err.Error(), "database is closed") {
		t.Errorf("expected the repo's closed-DB error, got %v", err)
	}
}

func TestAssignNoteToGroup_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "t1", "u1", "Tab 1", 1, nil)
	insertGroup(t, db, "g1", "u1", "Work", 1)

	err := svc.AssignNoteToGroup(context.Background(), "u1", "t1", strPtr("g1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id = 't1'`).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID == nil || *groupID != "g1" {
		t.Errorf("expected note t1 assigned to g1, got %v", groupID)
	}
}

func TestAssignNoteToGroup_Unassign(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "t1", "u1", "Tab 1", 1, strPtr("g1"))

	err := svc.AssignNoteToGroup(context.Background(), "u1", "t1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id = 't1'`).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID != nil {
		t.Errorf("expected group_id NULL after unassign, got %v", *groupID)
	}
}

func TestAssignNoteToGroup_NotFound(t *testing.T) {
	svc, _ := newNoteService(t)

	err := svc.AssignNoteToGroup(context.Background(), "u1", "missing", strPtr("g1"))
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Errorf("expected NotFound, got %v", err)
	}
}

func TestReorderTabsInGroup_Success(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "t1", "u1", "Tab 1", 1, strPtr("g1"))
	insertNote(t, db, "t2", "u1", "Tab 2", 2, strPtr("g1"))

	err := svc.ReorderTabsInGroup(context.Background(), "u1", "g1", []string{"t2", "t1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rows, err := db.Query(`SELECT id, position_at FROM notes WHERE group_id = 'g1' ORDER BY position_at ASC`)
	if err != nil {
		t.Fatalf("query positions: %v", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		var pos int64
		if err := rows.Scan(&id, &pos); err != nil {
			t.Fatalf("scan: %v", err)
		}
		ids = append(ids, id)
	}
	if len(ids) != 2 || ids[0] != "t2" || ids[1] != "t1" {
		t.Errorf("expected reorder [t2 t1], got %v", ids)
	}
}

func TestGetAllOnlyTabs_IncludesGroupID(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "Grouped", 1, strPtr("g1"))
	insertNote(t, db, "n2", "u1", "Ungrouped", 2, nil)

	tabs, err := svc.GetAllOnlyTabs(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tabs) != 2 {
		t.Fatalf("expected 2 tabs, got %d", len(tabs))
	}
	if tabs[0].GroupID == nil || *tabs[0].GroupID != "g1" {
		t.Errorf("tab[0] group_id: expected g1, got %v", tabs[0].GroupID)
	}
	if tabs[1].GroupID != nil {
		t.Errorf("tab[1] group_id: expected nil, got %v", tabs[1].GroupID)
	}
}

func TestCreateNote_ResponseIncludesGroupID(t *testing.T) {
	svc, db := newNoteService(t)
	insertGroup(t, db, "g1", "u1", "Work", 1)

	resp, err := svc.CreateNote(context.Background(), "u1", strPtr("g1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GroupID == nil || *resp.GroupID != "g1" {
		t.Errorf("expected response group_id=g1, got %v", resp.GroupID)
	}
}

func TestGetAllNotes_IncludesGroupID(t *testing.T) {
	svc, db := newNoteService(t)
	insertNote(t, db, "n1", "u1", "Grouped", 1, strPtr("g1"))
	insertNote(t, db, "n2", "u1", "Ungrouped", 2, nil)

	notes, err := svc.GetAllNotes(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("expected 2 notes, got %d", len(notes))
	}
	if notes[0].GroupID == nil || *notes[0].GroupID != "g1" {
		t.Errorf("notes[0] group_id: expected g1, got %v", notes[0].GroupID)
	}
	if notes[1].GroupID != nil {
		t.Errorf("notes[1] group_id: expected nil, got %v", notes[1].GroupID)
	}
}

// insertNoteFull seeds a note with explicit content (insertNote uses '').
func insertNoteFull(t *testing.T, db *sql.DB, id, userID, title, content string, position int64, groupID *string) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO notes (id, user_id, title, content, position_at, group_id) VALUES (?, ?, ?, ?, ?, ?)`,
		id, testutil.NullIfEmpty(userID), title, content, position, groupID,
	)
	if err != nil {
		t.Fatalf("insert note %s: %v", id, err)
	}
}

func TestSearchNotes_UserSeesOwnAndGlobal(t *testing.T) {
	svc, db := newNoteService(t)
	insertNoteFull(t, db, "own1", "u1", "My secret plan", "meeting notes", 1, nil)
	insertNoteFull(t, db, "global1", "", "Welcome", "shared plan content", 2, nil)
	insertNoteFull(t, db, "other1", "u2", "Other user plan", "private", 3, nil)

	res, err := svc.SearchNotes(context.Background(), "u1", "plan")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ids := map[string]bool{}
	for _, r := range res {
		ids[r.ID] = true
	}
	if !ids["own1"] || !ids["global1"] {
		t.Errorf("expected own1 + global1, got %v", ids)
	}
	if ids["other1"] {
		t.Errorf("must NOT return another user's note, got %v", ids)
	}
}

func TestSearchNotes_GuestSeesOnlyGlobal(t *testing.T) {
	svc, db := newNoteService(t)
	insertNoteFull(t, db, "own1", "u1", "My secret plan", "meeting notes", 1, nil)
	insertNoteFull(t, db, "global1", "", "Welcome plan", "shared content", 2, nil)

	res, err := svc.SearchNotes(context.Background(), "", "plan")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 1 || res[0].ID != "global1" {
		t.Errorf("guest should see only global1, got %+v", res)
	}
}

func TestSearchNotes_EscapesWildcards(t *testing.T) {
	svc, db := newNoteService(t)
	// Any content would match an unescaped '%'; any single-char position
	// would match an unescaped '_'.
	insertNoteFull(t, db, "n1", "", "alpha", "beta gamma", 1, nil)

	percent, err := svc.SearchNotes(context.Background(), "", "%")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(percent) != 0 {
		t.Errorf("literal %% must not match everything, got %d results", len(percent))
	}

	underscore, err := svc.SearchNotes(context.Background(), "", "_")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(underscore) != 0 {
		t.Errorf("literal _ must not match everything, got %d results", len(underscore))
	}

	// Literal underscore in content still matches when escaped.
	insertNoteFull(t, db, "n2", "", "snake", "a_b", 2, nil)
	lit, err := svc.SearchNotes(context.Background(), "", "_")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(lit) != 1 || lit[0].ID != "n2" {
		t.Errorf("expected only n2 (content a_b), got %+v", lit)
	}
}

func TestSearchNotes_ContentSnippet(t *testing.T) {
	svc, db := newNoteService(t)
	// Match appears only in content, mid-string with padding on both sides →
	// snippet is truncated on both ends with ellipses.
	content := strings.Repeat("filler words before ", 8) + "the needle is hidden here" + strings.Repeat(" and more filler after", 8)
	insertNoteFull(t, db, "n1", "", "Title only", content, 1, nil)
	// Title-only match → empty snippet.
	insertNoteFull(t, db, "n2", "", "needle in title", "no match body", 2, nil)

	res, err := svc.SearchNotes(context.Background(), "", "needle")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byID := map[string]*dtos.SearchNoteResponse{}
	for _, r := range res {
		byID[r.ID] = r
	}
	if snip := byID["n1"].ContentSnippet; !strings.Contains(snip, "needle") || !strings.HasPrefix(snip, "…") || !strings.HasSuffix(snip, "…") {
		t.Errorf("expected centered snippet with ellipses for n1, got %q", snip)
	}
	if snip := byID["n2"].ContentSnippet; snip != "" {
		t.Errorf("expected empty snippet for title-only match n2, got %q", snip)
	}
}

func TestSearchNotes_TitleMatchRanksFirst(t *testing.T) {
	svc, db := newNoteService(t)
	// Content-only match, older.
	insertNoteFull(t, db, "content-hit", "", "zzz", "contains the term deep inside", 1, nil)
	// Title match, newer.
	insertNoteFull(t, db, "title-hit", "", "the term list", "body", 2, nil)

	res, err := svc.SearchNotes(context.Background(), "", "term")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 2 {
		t.Fatalf("expected 2 results, got %d", len(res))
	}
	if res[0].ID != "title-hit" {
		t.Errorf("title match must rank first, got %s first", res[0].ID)
	}
}

func TestSearchNotes_GroupContext(t *testing.T) {
	svc, db := newNoteService(t)
	insertGroup(t, db, "g1", "u1", "Work", 1)
	insertNoteFull(t, db, "grouped", "u1", "grocery list", "milk eggs", 1, strPtr("g1"))
	insertNoteFull(t, db, "ungrouped", "u1", "grocery notes", "milk eggs", 2, nil)

	res, err := svc.SearchNotes(context.Background(), "u1", "grocery")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byID := map[string]*dtos.SearchNoteResponse{}
	for _, r := range res {
		byID[r.ID] = r
	}
	if byID["grouped"].GroupID == nil || *byID["grouped"].GroupID != "g1" ||
		byID["grouped"].GroupName == nil || *byID["grouped"].GroupName != "Work" {
		t.Errorf("expected grouped note to carry g1/Work, got %+v", byID["grouped"])
	}
	if byID["ungrouped"].GroupID != nil || byID["ungrouped"].GroupName != nil {
		t.Errorf("expected nil group fields for ungrouped note, got %+v", byID["ungrouped"])
	}
}

func TestSearchNotes_NoMatchReturnsEmpty(t *testing.T) {
	svc, db := newNoteService(t)
	insertNoteFull(t, db, "n1", "", "alpha", "beta", 1, nil)

	res, err := svc.SearchNotes(context.Background(), "", "zzz-no-such-term")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 0 {
		t.Errorf("expected empty result, got %+v", res)
	}
}

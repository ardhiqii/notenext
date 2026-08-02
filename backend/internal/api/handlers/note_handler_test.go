package handlers_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
	"github.com/gin-gonic/gin"
)

// setupNoteRouter wires a real NoteService over in-memory SQLite into the
// NoteHandler. authService is only used by the websocket handler, which these
// tests never hit, so a zero-value pointer is safe. userID=="" = guest.
func setupNoteRouter(t *testing.T, userID string) (*gin.Engine, *sql.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	noteService := services.NewNoteService(repositories.NewNoteRepository(db), repositories.NewTabGroupRepoInterface(db))
	h := handlers.NewNoteHandler(noteService, &services.AuthService{})

	r := gin.New()
	if userID != "" {
		r.Use(func(c *gin.Context) {
			c.Set(constants.ContextKeys.UserID, userID)
			c.Next()
		})
	}
	r.POST("/notes", h.CreateNote)
	r.GET("/notes", h.GetAllNotes)
	r.GET("/notes/:id", h.GetNoteById)
	r.PATCH("/notes/:id", h.UpdateNote)
	r.DELETE("/notes/:id", h.DeleteNote)
	return r, db
}

func seedNote(t *testing.T, db *sql.DB, id, userID, title string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO notes (id, user_id, title, content, position_at) VALUES (?, ?, ?, '', 1)`,
		id, testutil.NullIfEmpty(userID), title)
	if err != nil {
		t.Fatalf("seed note %s: %v", id, err)
	}
}

func seedGroup(t *testing.T, db *sql.DB, id, userID, name string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO tab_groups (id, user_id, name, position_at, collapsed) VALUES (?, ?, ?, 1, 0)`,
		id, testutil.NullIfEmpty(userID), name)
	if err != nil {
		t.Fatalf("seed group %s: %v", id, err)
	}
}

type noteDataResponse struct {
	Data struct {
		ID         string `json:"id"`
		Title      string `json:"title"`
		Content    string `json:"content"`
		PositionAt int64  `json:"position_at"`
	} `json:"data"`
}

func TestCreateNote_Success(t *testing.T) {
	r, _ := setupNoteRouter(t, "test-user")

	w := doRequest(r, http.MethodPost, "/notes", "")
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[noteDataResponse](t, w)
	if resp.Data.ID == "" {
		t.Error("expected non-empty note id")
	}
	if resp.Data.Title != "New note" {
		t.Errorf("expected title %q, got %q", "New note", resp.Data.Title)
	}
	if resp.Data.PositionAt != 1 {
		t.Errorf("expected position 1, got %d", resp.Data.PositionAt)
	}
}

func TestCreateNote_LimitReached(t *testing.T) {
	r, db := setupNoteRouter(t, "") // guest: no auth middleware
	for i := 1; i <= 3; i++ {
		seedNote(t, db, "guest-note-"+string(rune('0'+i)), "", "Note")
	}

	w := doRequest(r, http.MethodPost, "/notes", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "public notes limit reached" {
		t.Errorf("expected %q, got %q", "public notes limit reached", resp.Error.Message)
	}
}

func TestCreateNote_WithOwnedGroup(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedGroup(t, db, "g1", "test-user", "Work")

	w := doRequest(r, http.MethodPost, "/notes", `{"group_id":"g1"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[noteDataResponse](t, w)
	if resp.Data.ID == "" {
		t.Error("expected non-empty note id")
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id = ?`, resp.Data.ID).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID == nil || *groupID != "g1" {
		t.Errorf("expected note in group g1, got %v", groupID)
	}
}

func TestCreateNote_WithGroupOfAnotherUser(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedGroup(t, db, "g1", "other-user", "Private")

	w := doRequest(r, http.MethodPost, "/notes", `{"group_id":"g1"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateNote_NoBodyGroupIDNull(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")

	w := doRequest(r, http.MethodPost, "/notes", "")
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[noteDataResponse](t, w)

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id = ?`, resp.Data.ID).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID != nil {
		t.Errorf("expected group_id NULL, got %v", *groupID)
	}
}

func TestGetAllNotes_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "First")
	seedNote(t, db, "n2", "test-user", "Second")
	seedNote(t, db, "n3", "test-user", "Third")

	w := doRequest(r, http.MethodGet, "/notes", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Data) != 3 {
		t.Fatalf("expected 3 notes, got %d", len(resp.Data))
	}
	if resp.Data[0].Title != "First" {
		t.Errorf("unexpected first note %q", resp.Data[0].Title)
	}
}

func TestGetNoteById_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "My note")

	w := doRequest(r, http.MethodGet, "/notes/n1", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[noteDataResponse](t, w)
	if resp.Data.ID != "n1" || resp.Data.Title != "My note" {
		t.Errorf("unexpected note: %+v", resp.Data)
	}
}

func TestGetNoteById_NotFound(t *testing.T) {
	r, _ := setupNoteRouter(t, "test-user")

	w := doRequest(r, http.MethodGet, "/notes/bad", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "note is not found" {
		t.Errorf("expected %q, got %q", "note is not found", resp.Error.Message)
	}
}

func TestUpdateNote_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "Old title")

	w := doRequest(r, http.MethodPatch, "/notes/n1", `{"title":"hi"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var title string
	if err := db.QueryRow(`SELECT title FROM notes WHERE id='n1'`).Scan(&title); err != nil {
		t.Fatalf("query title: %v", err)
	}
	if title != "hi" {
		t.Errorf("expected title hi, got %q", title)
	}
}

func TestUpdateNote_InvalidBody(t *testing.T) {
	r, _ := setupNoteRouter(t, "test-user")

	w := doRequest(r, http.MethodPatch, "/notes/n1", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Failed to update note" {
		t.Errorf("expected %q, got %q", "Failed to update note", resp.Error.Message)
	}
}

func TestDeleteNote_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "To delete")

	w := doRequest(r, http.MethodDelete, "/notes/n1", "")
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notes WHERE id='n1'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Errorf("expected note deleted, count=%d", count)
	}
}

func TestGetAllNotes_OnlyTabs_ReturnsGroupID(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedGroup(t, db, "g1", "test-user", "Work")
	// Insert a note directly with group_id set
	_, err := db.Exec(
		`INSERT INTO notes (id, user_id, title, content, position_at, group_id) VALUES (?, ?, ?, '', 1, ?)`,
		"n1", "test-user", "Grouped", "g1",
	)
	if err != nil {
		t.Fatalf("seed note: %v", err)
	}

	w := doRequest(r, http.MethodGet, "/notes?only_tabs=true", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			ID      string  `json:"id"`
			Title   string  `json:"title"`
			GroupID *string `json:"group_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Data) == 0 {
		t.Fatal("expected at least 1 tab")
	}
	if resp.Data[0].GroupID == nil || *resp.Data[0].GroupID != "g1" {
		t.Errorf("expected group_id=g1 in only_tabs response, got %v", resp.Data[0].GroupID)
	}
}

// TestGetAllNotes_OnlyTabs_OmitsContent guards the only_tabs branch against
// mutation: TabResponse has no "content" field while NoteResponse does. If the
// branch condition were negated, only_tabs=true would return NoteResponse (with
// content) and a plain GET would return TabResponse (without content), so both
// directions must be asserted.
func TestGetAllNotes_OnlyTabs_OmitsContent(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	// Non-empty content makes the two response shapes visibly different.
	_, err := db.Exec(
		`INSERT INTO notes (id, user_id, title, content, position_at) VALUES (?, ?, ?, ?, 1)`,
		"n1", "test-user", "Tab title", "secret content",
	)
	if err != nil {
		t.Fatalf("seed note: %v", err)
	}

	// only_tabs=true → TabResponse: "content" must be absent.
	w := doRequest(r, http.MethodGet, "/notes?only_tabs=true", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var tabsResp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &tabsResp); err != nil {
		t.Fatalf("decode tabs: %v", err)
	}
	if len(tabsResp.Data) != 1 {
		t.Fatalf("expected 1 tab, got %d", len(tabsResp.Data))
	}
	if _, ok := tabsResp.Data[0]["content"]; ok {
		t.Errorf("only_tabs response must NOT include content, got %v", tabsResp.Data[0])
	}

	// plain GET → NoteResponse: "content" must be present with the seeded value.
	w = doRequest(r, http.MethodGet, "/notes", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var notesResp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &notesResp); err != nil {
		t.Fatalf("decode notes: %v", err)
	}
	if len(notesResp.Data) != 1 {
		t.Fatalf("expected 1 note, got %d", len(notesResp.Data))
	}
	content, ok := notesResp.Data[0]["content"]
	if !ok {
		t.Errorf("notes response must include content, got %v", notesResp.Data[0])
	} else if content != "secret content" {
		t.Errorf("expected content %q, got %v", "secret content", content)
	}
}

func TestCreateNote_ResponseIncludesGroupID(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedGroup(t, db, "g1", "test-user", "Work")

	w := doRequest(r, http.MethodPost, "/notes", `{"group_id":"g1"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Parse the gin.H wrapper: {"data": {...}, "message": "..."}
	var resp struct {
		Data struct {
			ID      string  `json:"id"`
			GroupID *string `json:"group_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Data.GroupID == nil || *resp.Data.GroupID != "g1" {
		t.Errorf("expected group_id=g1 in create response, got %v", resp.Data.GroupID)
	}
}

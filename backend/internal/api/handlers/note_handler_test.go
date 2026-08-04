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
	r.PATCH("/notes/tabs/:id", h.UpdateTabPosition)
	r.POST("/notes/export", h.ExportNotesByIds)
	r.POST("/notes/import", h.ImportNotes)
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

func TestDeleteNote_GuestForbidden(t *testing.T) {
	r, db := setupNoteRouter(t, "") // guest
	seedNote(t, db, "pub1", "", "Public note")

	w := doRequest(r, http.MethodDelete, "/notes/pub1", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notes WHERE id='pub1'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("global note must survive guest delete, count=%d", count)
	}
}

func TestDeleteNote_NotFound(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "other-user", "Not mine")

	w := doRequest(r, http.MethodDelete, "/notes/n1", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateNote_GuestForbidden(t *testing.T) {
	r, db := setupNoteRouter(t, "") // guest
	seedNote(t, db, "pub1", "", "Public note")

	w := doRequest(r, http.MethodPatch, "/notes/pub1", `{"title":"hacked"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}

	var title string
	if err := db.QueryRow(`SELECT title FROM notes WHERE id='pub1'`).Scan(&title); err != nil {
		t.Fatalf("query title: %v", err)
	}
	if title != "Public note" {
		t.Errorf("global note must be unchanged, got %q", title)
	}
}

func TestUpdateNote_PublicNoteBySignedInUser(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "pub1", "", "Public note")

	w := doRequest(r, http.MethodPatch, "/notes/pub1", `{"content":"edited by user"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var content string
	if err := db.QueryRow(`SELECT content FROM notes WHERE id='pub1'`).Scan(&content); err != nil {
		t.Fatalf("query content: %v", err)
	}
	if content != "edited by user" {
		t.Errorf("expected content %q, got %q", "edited by user", content)
	}
}

func TestUpdateNote_NotFound(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "other-user", "Not mine")

	w := doRequest(r, http.MethodPatch, "/notes/n1", `{"title":"hacked"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateTabPosition_Unauthenticated(t *testing.T) {
	r, db := setupNoteRouter(t, "") // guest: no userID in context
	seedNote(t, db, "n1", "test-user", "Tab")

	w := doRequest(r, http.MethodPatch, "/notes/tabs/n1", `{"position_at":3}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateTabPosition_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "Tab")

	w := doRequest(r, http.MethodPatch, "/notes/tabs/n1", `{"position_at":4}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var pos int64
	if err := db.QueryRow(`SELECT position_at FROM notes WHERE id='n1'`).Scan(&pos); err != nil {
		t.Fatalf("query position: %v", err)
	}
	if pos != 4 {
		t.Errorf("expected position 4, got %d", pos)
	}
}

func TestUpdateTabPosition_NotFound(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "other-user", "Not mine")

	w := doRequest(r, http.MethodPatch, "/notes/tabs/n1", `{"position_at":4}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateTabPosition_NegativePosition(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "n1", "test-user", "Tab")

	w := doRequest(r, http.MethodPatch, "/notes/tabs/n1", `{"position_at":-1}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestExportNotesByIds_Scoped(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	seedNote(t, db, "own1", "test-user", "Mine")
	seedNote(t, db, "other1", "other-user", "Theirs")
	seedNote(t, db, "global1", "", "Global")

	w := doRequest(r, http.MethodPost, "/notes/export", `{"noteIds":["own1","other1","global1"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			Notes []struct {
				ID string `json:"id"`
			} `json:"notes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	got := map[string]bool{}
	for _, n := range resp.Data.Notes {
		got[n.ID] = true
	}
	if !got["own1"] || !got["global1"] {
		t.Errorf("expected own1 + global1 in export, got %v", got)
	}
	if got["other1"] {
		t.Errorf("must NOT export another user's note, got %v", got)
	}
}

func TestImportNotes_GuestLimitReached(t *testing.T) {
	r, db := setupNoteRouter(t, "") // guest
	seedNote(t, db, "g1", "", "Global 1")
	seedNote(t, db, "g2", "", "Global 2")

	body := `{"notes":[{"title":"A"},{"title":"B"},{"title":"C"},{"title":"D"},{"title":"E"}]}`
	w := doRequest(r, http.MethodPost, "/notes/import", body)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notes WHERE user_id IS NULL`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 2 {
		t.Errorf("guest notes must stay at 2, got %d", count)
	}
}

func TestImportNotes_LoggedIn_Success(t *testing.T) {
	r, db := setupNoteRouter(t, "test-user")
	body := `{"notes":[{"title":"A"},{"title":"B"}]}`
	w := doRequest(r, http.MethodPost, "/notes/import", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notes WHERE user_id = 'test-user'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 notes created, got %d", count)
	}
}

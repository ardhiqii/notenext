package handlers_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
	"github.com/gin-gonic/gin"
)

// mockTabGroupRepo for handler tests: same shape as the service-level mock but
// focused on what handlers exercise.
type mockTabGroupRepo struct {
	createFn         func(ctx context.Context, userID, name string) (*entities.TabGroup, error)
	getAllWithTabsFn func(ctx context.Context, userID string) ([]*entities.TabGroup, []*entities.Note, error)
	getByIDFn        func(ctx context.Context, userID, id string) (*entities.TabGroup, error)
	updateNameFn     func(ctx context.Context, userID, id, name string) error
	deleteFn         func(ctx context.Context, userID, id string) error
	reorderFn        func(ctx context.Context, userID string, groupIDs []string) error
	toggleCollapseFn func(ctx context.Context, userID, id string, collapsed bool) error

	reorderedIDs []string
	toggledIDs   []string
	toggleValues []bool
	renamedID    string
	renamedName  string
	deletedID    string
}

func (m *mockTabGroupRepo) Create(ctx context.Context, userID, name string) (*entities.TabGroup, error) {
	if m.createFn != nil {
		return m.createFn(ctx, userID, name)
	}
	return &entities.TabGroup{ID: "g1", Name: name, PositionAt: 1, CreatedAt: "now", UpdatedAt: "now"}, nil
}

func (m *mockTabGroupRepo) GetAllWithTabs(ctx context.Context, userID string) ([]*entities.TabGroup, []*entities.Note, error) {
	if m.getAllWithTabsFn != nil {
		return m.getAllWithTabsFn(ctx, userID)
	}
	return []*entities.TabGroup{}, []*entities.Note{}, nil
}

func (m *mockTabGroupRepo) GetByID(ctx context.Context, userID, id string) (*entities.TabGroup, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, userID, id)
	}
	return nil, repositories.RepoErrors.NotFound
}

func (m *mockTabGroupRepo) UpdateName(ctx context.Context, userID, id, name string) error {
	m.renamedID = id
	m.renamedName = name
	if m.updateNameFn != nil {
		return m.updateNameFn(ctx, userID, id, name)
	}
	return nil
}

func (m *mockTabGroupRepo) Delete(ctx context.Context, userID, id string) error {
	m.deletedID = id
	if m.deleteFn != nil {
		return m.deleteFn(ctx, userID, id)
	}
	return nil
}

func (m *mockTabGroupRepo) Reorder(ctx context.Context, userID string, groupIDs []string) error {
	m.reorderedIDs = groupIDs
	if m.reorderFn != nil {
		return m.reorderFn(ctx, userID, groupIDs)
	}
	return nil
}

func (m *mockTabGroupRepo) ToggleCollapse(ctx context.Context, userID, id string, collapsed bool) error {
	m.toggledIDs = append(m.toggledIDs, id)
	m.toggleValues = append(m.toggleValues, collapsed)
	if m.toggleCollapseFn != nil {
		return m.toggleCollapseFn(ctx, userID, id, collapsed)
	}
	return nil
}

func (m *mockTabGroupRepo) CountByUserID(ctx context.Context, userID string) (int32, error) {
	return 0, nil
}

func (m *mockTabGroupRepo) GetLastPositionForNotes(ctx context.Context, userID string, groupID *string) (*int64, error) {
	pos := int64(1)
	return &pos, nil
}

// setupTabGroupRouter wires the real TabGroupService (over the mock repo) and a
// real NoteService over in-memory SQLite, then registers all tab-group routes.
// userID=="" skips the auth middleware (guest). Returns router + DB handle for
// seeding notes/groups used by assign/reorder endpoints.
func setupTabGroupRouter(t *testing.T, mock *mockTabGroupRepo, userID string) (*gin.Engine, *sql.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	noteService := services.NewNoteService(repositories.NewNoteRepository(db), repositories.NewTabGroupRepoInterface(db))
	groupService := services.NewTabGroupService(mock)
	h := handlers.NewTabGroupHandler(groupService, noteService)

	r := gin.New()
	if userID != "" {
		r.Use(func(c *gin.Context) {
			c.Set(constants.ContextKeys.UserID, userID)
			c.Next()
		})
	}
	// Static /reorder must be registered before /:id (gin route conflict).
	r.POST("/groups", h.Create)
	r.GET("/groups", h.GetAllWithTabs)
	r.PATCH("/groups/reorder", h.Reorder)
	r.GET("/groups/:id", h.GetByID)
	r.PATCH("/groups/:id", h.Rename)
	r.DELETE("/groups/:id", h.Delete)
	r.PATCH("/groups/:id/collapse", h.ToggleCollapse)
	r.PATCH("/groups/:id/tabs/reorder", h.ReorderTabsInGroup)
	r.PATCH("/tabs/:tabId/group", h.AssignGroup)
	return r, db
}

func doRequest(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	var buf *bytes.Reader
	if body == "" {
		buf = bytes.NewReader(nil)
	} else {
		buf = bytes.NewReader([]byte(body))
	}
	req := httptest.NewRequest(method, path, buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// --- response helpers ---

type groupDataResponse struct {
	Data dtos.TabGroupResponse `json:"data"`
}

type tabsWithGroupsData struct {
	Data dtos.TabsWithGroupsResponse `json:"data"`
}

type errResponse struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode body %q: %v", w.Body.String(), err)
	}
	return v
}

func TestCreateGroup_Success(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodPost, "/groups", `{"name":"work"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data    dtos.TabGroupResponse `json:"data"`
		Message string                `json:"message"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Data.ID == "" {
		t.Error("expected non-empty id")
	}
	if resp.Data.Name != "work" {
		t.Errorf("expected name work, got %q", resp.Data.Name)
	}
	if resp.Data.Collapsed {
		t.Error("expected collapsed=false")
	}
	if resp.Message != "Tab group created successfully" {
		t.Errorf("unexpected message %q", resp.Message)
	}
}

func TestCreateGroup_InvalidBody(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodPost, "/groups", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Invalid group data" {
		t.Errorf("expected %q, got %q", "Invalid group data", resp.Error.Message)
	}
}

func TestCreateGroup_InternalError(t *testing.T) {
	mock := &mockTabGroupRepo{createFn: func(context.Context, string, string) (*entities.TabGroup, error) {
		return nil, errors.New("boom")
	}}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPost, "/groups", `{"name":"x"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Failed to create tab group" {
		t.Errorf("expected %q, got %q", "Failed to create tab group", resp.Error.Message)
	}
}

// Guests must NOT be able to create tab groups — an unauthenticated create
// would orphan a row with user_id NULL that can never be deleted (delete is
// ownership-scoped). All group mutations reject guests with 401.
func TestTabGroupMutations_GuestRejected(t *testing.T) {
	mock := &mockTabGroupRepo{}
	r, db := setupTabGroupRouter(t, mock, "")
	// Seed a note so assign/reorder paths reach the auth guard (they must 401
	// before touching the DB, but a missing seed would 404 instead of proving
	// the guard fires first).
	_, err := db.Exec(`INSERT INTO notes (id, title, content, position_at) VALUES ('n1','seed','',1)`)
	if err != nil {
		t.Fatalf("seed note: %v", err)
	}

	cases := []struct {
		name, method, path, body string
	}{
		{"create", http.MethodPost, "/groups", `{"name":"x"}`},
		{"rename", http.MethodPatch, "/groups/g1", `{"name":"y"}`},
		{"delete", http.MethodDelete, "/groups/g1", ""},
		{"reorder", http.MethodPatch, "/groups/reorder", `{"group_ids":["g1"]}`},
		{"toggle-collapse", http.MethodPatch, "/groups/g1/collapse", `{"collapsed":true}`},
		{"assign", http.MethodPatch, "/tabs/n1/group", `{"group_id":"g1"}`},
		{"reorder-tabs", http.MethodPatch, "/groups/g1/tabs/reorder", `{"tab_ids":["n1"]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := doRequest(r, tc.method, tc.path, tc.body)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
			}
			resp := decode[errResponse](t, w)
			if resp.Error.Message != "authentication required" {
				t.Errorf("expected %q, got %q", "authentication required", resp.Error.Message)
			}
		})
	}
}

func TestGetAllWithTabs_Success(t *testing.T) {
	mock := &mockTabGroupRepo{
		getAllWithTabsFn: func(context.Context, string) ([]*entities.TabGroup, []*entities.Note, error) {
			groups := []*entities.TabGroup{{ID: "g1", Name: "Work", PositionAt: 1}}
			notes := []*entities.Note{
				{ID: "n1", Title: "In group", PositionAt: 1, GroupID: strPtr("g1")},
				{ID: "n2", Title: "Ungrouped", PositionAt: 2},
			}
			return groups, notes, nil
		},
	}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodGet, "/groups", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[tabsWithGroupsData](t, w)
	if len(resp.Data.Groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(resp.Data.Groups))
	}
	if resp.Data.Groups[0].Name != "Work" {
		t.Errorf("unexpected group name %q", resp.Data.Groups[0].Name)
	}
	if len(resp.Data.Groups[0].Tabs) != 1 || resp.Data.Groups[0].Tabs[0].ID != "n1" {
		t.Errorf("unexpected group tabs: %+v", resp.Data.Groups[0].Tabs)
	}
	if len(resp.Data.UngroupedTabs) != 1 || resp.Data.UngroupedTabs[0].ID != "n2" {
		t.Errorf("unexpected ungrouped tabs: %+v", resp.Data.UngroupedTabs)
	}
}

func TestGetGroupByID_Success(t *testing.T) {
	mock := &mockTabGroupRepo{
		getByIDFn: func(_ context.Context, _, id string) (*entities.TabGroup, error) {
			return &entities.TabGroup{ID: id, Name: "Work", PositionAt: 1}, nil
		},
	}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodGet, "/groups/some-id", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[groupDataResponse](t, w)
	if resp.Data.ID != "some-id" || resp.Data.Name != "Work" {
		t.Errorf("unexpected group: %+v", resp.Data)
	}
}

func TestGetGroupByID_NotFound(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodGet, "/groups/nonexistent", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Tab group not found" {
		t.Errorf("expected %q, got %q", "Tab group not found", resp.Error.Message)
	}
}

func TestRename_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/some-id", `{"name":"new"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if w.Body.Len() != 0 {
		t.Errorf("expected empty body, got %q", w.Body.String())
	}
	if mock.renamedID != "some-id" || mock.renamedName != "new" {
		t.Errorf("unexpected rename call: id=%q name=%q", mock.renamedID, mock.renamedName)
	}
}

func TestRename_NotFound(t *testing.T) {
	mock := &mockTabGroupRepo{updateNameFn: func(context.Context, string, string, string) error {
		return repositories.RepoErrors.NotFound
	}}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/nonexistent", `{"name":"x"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRename_InvalidBody(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/some-id", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Invalid rename data" {
		t.Errorf("expected %q, got %q", "Invalid rename data", resp.Error.Message)
	}
}

func TestDelete_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodDelete, "/groups/some-id", "")
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
	if mock.deletedID != "some-id" {
		t.Errorf("expected delete called with some-id, got %q", mock.deletedID)
	}
}

func TestDelete_NotFound(t *testing.T) {
	mock := &mockTabGroupRepo{deleteFn: func(context.Context, string, string) error {
		return repositories.RepoErrors.NotFound
	}}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodDelete, "/groups/nonexistent", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestReorder_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/reorder", `{"group_ids":["g2","g1"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(mock.reorderedIDs) != 2 || mock.reorderedIDs[0] != "g2" || mock.reorderedIDs[1] != "g1" {
		t.Errorf("expected reorder [g2 g1], got %v", mock.reorderedIDs)
	}
}

func TestReorder_InvalidBody(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/reorder", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Invalid reorder data" {
		t.Errorf("expected %q, got %q", "Invalid reorder data", resp.Error.Message)
	}
}

func TestToggleCollapse_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/some-id/collapse", `{"collapsed":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(mock.toggledIDs) != 1 || mock.toggledIDs[0] != "some-id" {
		t.Errorf("unexpected toggle ids: %v", mock.toggledIDs)
	}
	if len(mock.toggleValues) != 1 || mock.toggleValues[0] != true {
		t.Errorf("expected collapsed=true, got %v", mock.toggleValues)
	}
}

func TestToggleCollapse_NotFound(t *testing.T) {
	mock := &mockTabGroupRepo{toggleCollapseFn: func(context.Context, string, string, bool) error {
		return repositories.RepoErrors.NotFound
	}}
	r, _ := setupTabGroupRouter(t, mock, "test-user")

	w := doRequest(r, http.MethodPatch, "/groups/nonexistent/collapse", `{"collapsed":true}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Tab group not found" {
		t.Errorf("expected %q, got %q", "Tab group not found", resp.Error.Message)
	}
}

func TestAssignGroup_Success(t *testing.T) {
	r, db := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")
	_, err := db.Exec(`INSERT INTO notes (id, user_id, title, content, position_at) VALUES ('t1','test-user','Tab 1','',1)`)
	if err != nil {
		t.Fatalf("seed note: %v", err)
	}

	w := doRequest(r, http.MethodPatch, "/tabs/t1/group", `{"group_id":"g1"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id='t1'`).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID == nil || *groupID != "g1" {
		t.Errorf("expected note t1 assigned to g1, got %v", groupID)
	}
}

func TestAssignGroup_Unassign(t *testing.T) {
	r, db := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")
	_, err := db.Exec(`INSERT INTO notes (id, user_id, title, content, position_at, group_id) VALUES ('t1','test-user','Tab 1','',1,'g1')`)
	if err != nil {
		t.Fatalf("seed note: %v", err)
	}

	w := doRequest(r, http.MethodPatch, "/tabs/t1/group", `{"group_id":null}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var groupID *string
	if err := db.QueryRow(`SELECT group_id FROM notes WHERE id='t1'`).Scan(&groupID); err != nil {
		t.Fatalf("query group_id: %v", err)
	}
	if groupID != nil {
		t.Errorf("expected group_id NULL after unassign, got %v", *groupID)
	}
}

func TestAssignGroup_InvalidBody(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	// group_id has no `required` binding, so `{}` binds fine; a malformed JSON
	// body is what actually trips ShouldBindJSON.
	w := doRequest(r, http.MethodPatch, "/tabs/t1/group", `{`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Invalid group assignment data" {
		t.Errorf("expected %q, got %q", "Invalid group assignment data", resp.Error.Message)
	}
}

func TestAssignGroup_NotFound(t *testing.T) {
	r, _ := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")

	w := doRequest(r, http.MethodPatch, "/tabs/bad-tab/group", `{"group_id":"g1"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
	resp := decode[errResponse](t, w)
	if resp.Error.Message != "Tab not found" {
		t.Errorf("expected %q, got %q", "Tab not found", resp.Error.Message)
	}
}

func TestReorderTabsInGroup_Success(t *testing.T) {
	r, db := setupTabGroupRouter(t, &mockTabGroupRepo{}, "test-user")
	_, err := db.Exec(`INSERT INTO notes (id, user_id, title, content, position_at, group_id) VALUES ('t1','test-user','Tab 1','',1,'g1'), ('t2','test-user','Tab 2','',2,'g1')`)
	if err != nil {
		t.Fatalf("seed notes: %v", err)
	}

	w := doRequest(r, http.MethodPatch, "/groups/g1/tabs/reorder", `{"tab_ids":["t2","t1"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var id1, id2 string
	if err := db.QueryRow(`SELECT id FROM notes WHERE group_id='g1' AND position_at=1`).Scan(&id1); err != nil {
		t.Fatalf("query pos 1: %v", err)
	}
	if err := db.QueryRow(`SELECT id FROM notes WHERE group_id='g1' AND position_at=2`).Scan(&id2); err != nil {
		t.Fatalf("query pos 2: %v", err)
	}
	if id1 != "t2" || id2 != "t1" {
		t.Errorf("expected reorder [t2 t1], got [%s %s]", id1, id2)
	}
}

func strPtr(s string) *string { return &s }

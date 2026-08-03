package services_test

import (
	"context"
	"errors"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
)

// mockTabGroupRepo is a hand-rolled mock of repositories.TabGroupRepoInterface.
// Each method has an optional fn override; calls are recorded for assertions.
type mockTabGroupRepo struct {
	createFn         func(ctx context.Context, userID, name string) (*entities.TabGroup, error)
	getAllWithTabsFn func(ctx context.Context, userID string) ([]*entities.TabGroup, []*entities.Note, error)
	getByIDFn        func(ctx context.Context, userID, id string) (*entities.TabGroup, error)
	updateNameFn     func(ctx context.Context, userID, id, name string) error
	deleteFn         func(ctx context.Context, userID, id string) error
	reorderFn        func(ctx context.Context, userID string, groupIDs []string) error
	toggleCollapseFn func(ctx context.Context, userID, id string, collapsed bool) error
	countByUserIDFn  func(ctx context.Context, userID string) (int32, error)
	getLastPosFn     func(ctx context.Context, userID string, groupID *string) (*int64, error)

	// call records
	createUserID  string
	createName    string
	renamedUserID string
	renamedID     string
	renamedName   string
	deletedUserID string
	deletedID     string
	reorderUserID string
	reorderedIDs  []string
	toggleUserID  string
	toggleID      string
	toggleValues  []bool
}

func (m *mockTabGroupRepo) Create(ctx context.Context, userID, name string) (*entities.TabGroup, error) {
	m.createUserID = userID
	m.createName = name
	if m.createFn != nil {
		return m.createFn(ctx, userID, name)
	}
	return &entities.TabGroup{ID: "g1", Name: name, PositionAt: 1}, nil
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
	m.renamedUserID = userID
	m.renamedID = id
	m.renamedName = name
	if m.updateNameFn != nil {
		return m.updateNameFn(ctx, userID, id, name)
	}
	return nil
}

func (m *mockTabGroupRepo) Delete(ctx context.Context, userID, id string) error {
	m.deletedUserID = userID
	m.deletedID = id
	if m.deleteFn != nil {
		return m.deleteFn(ctx, userID, id)
	}
	return nil
}

func (m *mockTabGroupRepo) Reorder(ctx context.Context, userID string, groupIDs []string) error {
	m.reorderUserID = userID
	m.reorderedIDs = groupIDs
	if m.reorderFn != nil {
		return m.reorderFn(ctx, userID, groupIDs)
	}
	return nil
}

func (m *mockTabGroupRepo) ToggleCollapse(ctx context.Context, userID, id string, collapsed bool) error {
	m.toggleUserID = userID
	m.toggleID = id
	m.toggleValues = append(m.toggleValues, collapsed)
	if m.toggleCollapseFn != nil {
		return m.toggleCollapseFn(ctx, userID, id, collapsed)
	}
	return nil
}

func (m *mockTabGroupRepo) CountByUserID(ctx context.Context, userID string) (int32, error) {
	if m.countByUserIDFn != nil {
		return m.countByUserIDFn(ctx, userID)
	}
	return 0, nil
}

func (m *mockTabGroupRepo) GetLastPositionForNotes(ctx context.Context, userID string, groupID *string) (*int64, error) {
	if m.getLastPosFn != nil {
		return m.getLastPosFn(ctx, userID, groupID)
	}
	pos := int64(1)
	return &pos, nil
}

func strPtr(s string) *string { return &s }

func TestCreate_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	resp, err := svc.Create(context.Background(), "u1", &dtos.CreateTabGroupRequest{Name: "work"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID == "" {
		t.Error("expected non-empty ID")
	}
	if resp.Name != "work" {
		t.Errorf("expected name work, got %q", resp.Name)
	}
	if resp.Collapsed {
		t.Error("expected Collapsed=false for a new group")
	}
	if resp.PositionAt == 0 {
		t.Error("expected non-zero PositionAt")
	}
	if mock.createUserID != "u1" {
		t.Errorf("expected create called with userID u1, got %q", mock.createUserID)
	}
}

func TestCreate_RepoError(t *testing.T) {
	boom := errors.New("db down")
	mock := &mockTabGroupRepo{createFn: func(context.Context, string, string) (*entities.TabGroup, error) {
		return nil, boom
	}}
	svc := services.NewTabGroupService(mock)

	resp, err := svc.Create(context.Background(), "u1", &dtos.CreateTabGroupRequest{Name: "work"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, boom) {
		t.Errorf("expected propagated error, got %v", err)
	}
	if resp != nil {
		t.Errorf("expected nil response, got %+v", resp)
	}
}

func TestGetAllWithTabs_Success(t *testing.T) {
	mock := &mockTabGroupRepo{
		getAllWithTabsFn: func(context.Context, string) ([]*entities.TabGroup, []*entities.Note, error) {
			groups := []*entities.TabGroup{
				{ID: "g1", Name: "Work", PositionAt: 1},
				{ID: "g2", Name: "Personal", PositionAt: 2},
			}
			notes := []*entities.Note{
				{ID: "n1", Title: "Tab 1", PositionAt: 1, GroupID: strPtr("g1")},
				{ID: "n2", Title: "Tab 2", PositionAt: 2, GroupID: strPtr("g1")},
				{ID: "n3", Title: "Tab 3", PositionAt: 3, GroupID: strPtr("g2")},
				{ID: "n4", Title: "Ungrouped 1", PositionAt: 4},
				{ID: "n5", Title: "Ungrouped 2", PositionAt: 5},
			}
			return groups, notes, nil
		},
	}
	svc := services.NewTabGroupService(mock)

	resp, err := svc.GetAllWithTabs(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(resp.Groups))
	}
	if len(resp.Groups[0].Tabs) != 2 {
		t.Errorf("expected group g1 to have 2 tabs, got %d", len(resp.Groups[0].Tabs))
	}
	if resp.Groups[0].Tabs[0].ID != "n1" || resp.Groups[0].Tabs[1].ID != "n2" {
		t.Errorf("unexpected tabs in g1: %+v", resp.Groups[0].Tabs)
	}
	if len(resp.Groups[1].Tabs) != 1 || resp.Groups[1].Tabs[0].ID != "n3" {
		t.Errorf("unexpected tabs in g2: %+v", resp.Groups[1].Tabs)
	}
	if len(resp.UngroupedTabs) != 2 {
		t.Fatalf("expected 2 ungrouped tabs, got %d", len(resp.UngroupedTabs))
	}
	if resp.UngroupedTabs[0].ID != "n4" || resp.UngroupedTabs[1].ID != "n5" {
		t.Errorf("unexpected ungrouped tabs: %+v", resp.UngroupedTabs)
	}
}

func TestGetAllWithTabs_Empty(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	resp, err := svc.GetAllWithTabs(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Groups) != 0 {
		t.Errorf("expected 0 groups, got %d", len(resp.Groups))
	}
	if len(resp.UngroupedTabs) != 0 {
		t.Errorf("expected 0 ungrouped tabs, got %d", len(resp.UngroupedTabs))
	}
}

func TestGetAllWithTabs_RepoError(t *testing.T) {
	boom := errors.New("boom")
	mock := &mockTabGroupRepo{
		getAllWithTabsFn: func(context.Context, string) ([]*entities.TabGroup, []*entities.Note, error) {
			return nil, nil, boom
		},
	}
	svc := services.NewTabGroupService(mock)

	resp, err := svc.GetAllWithTabs(context.Background(), "u1")
	if err == nil || !errors.Is(err, boom) {
		t.Fatalf("expected propagated error, got %v", err)
	}
	if resp != nil {
		t.Errorf("expected nil response, got %+v", resp)
	}
}

func TestRename_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	err := svc.Rename(context.Background(), "u1", "g1", "renamed")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.renamedUserID != "u1" || mock.renamedID != "g1" || mock.renamedName != "renamed" {
		t.Errorf("unexpected rename call: userID=%q id=%q name=%q", mock.renamedUserID, mock.renamedID, mock.renamedName)
	}
}

func TestRename_RepoError(t *testing.T) {
	boom := errors.New("boom")
	mock := &mockTabGroupRepo{updateNameFn: func(context.Context, string, string, string) error {
		return boom
	}}
	svc := services.NewTabGroupService(mock)

	err := svc.Rename(context.Background(), "u1", "g1", "x")
	if err == nil || !errors.Is(err, boom) {
		t.Fatalf("expected propagated error, got %v", err)
	}
}

func TestDelete_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	err := svc.Delete(context.Background(), "u1", "g1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.deletedUserID != "u1" || mock.deletedID != "g1" {
		t.Errorf("unexpected delete call: userID=%q id=%q", mock.deletedUserID, mock.deletedID)
	}
}

func TestDelete_RepoError(t *testing.T) {
	boom := errors.New("boom")
	mock := &mockTabGroupRepo{deleteFn: func(context.Context, string, string) error {
		return boom
	}}
	svc := services.NewTabGroupService(mock)

	err := svc.Delete(context.Background(), "u1", "g1")
	if err == nil || !errors.Is(err, boom) {
		t.Fatalf("expected propagated error, got %v", err)
	}
}

func TestReorder_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	order := []string{"g2", "g1"}
	err := svc.Reorder(context.Background(), "u1", order)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.reorderUserID != "u1" {
		t.Errorf("expected reorder called with userID u1, got %q", mock.reorderUserID)
	}
	if len(mock.reorderedIDs) != 2 || mock.reorderedIDs[0] != "g2" || mock.reorderedIDs[1] != "g1" {
		t.Errorf("expected reorder with [g2 g1], got %v", mock.reorderedIDs)
	}
}

func TestToggleCollapse_Success(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	err := svc.ToggleCollapse(context.Background(), "u1", "g1", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.toggleUserID != "u1" || mock.toggleID != "g1" {
		t.Errorf("unexpected toggle call: userID=%q id=%q", mock.toggleUserID, mock.toggleID)
	}
	if len(mock.toggleValues) != 1 || mock.toggleValues[0] != true {
		t.Errorf("expected toggle called with collapsed=true, got %v", mock.toggleValues)
	}
}

func TestToggleCollapse_False(t *testing.T) {
	mock := &mockTabGroupRepo{}
	svc := services.NewTabGroupService(mock)

	err := svc.ToggleCollapse(context.Background(), "u1", "g1", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mock.toggleValues) != 1 || mock.toggleValues[0] != false {
		t.Errorf("expected toggle called with collapsed=false, got %v", mock.toggleValues)
	}
}

// dtosCreateTabGroupRequest removed — tests use dtos.CreateTabGroupRequest directly.

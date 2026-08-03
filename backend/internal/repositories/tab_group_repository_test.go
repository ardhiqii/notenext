package repositories

import (
	"context"
	"errors"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/testutil"
)

func newTabGroupRepoTestDB(t *testing.T) (*TabGroupRepository, context.Context) {
	t.Helper()
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("new test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewTabGroupRepository(db), context.Background()
}

func createTestGroup(t *testing.T, r *TabGroupRepository, ctx context.Context, userID, name string) string {
	t.Helper()
	g, err := r.Create(ctx, userID, name)
	if err != nil {
		t.Fatalf("create group %q: %v", name, err)
	}
	return g.ID
}

func TestTabGroupUpdateNameReturnsNotFoundForMissingGroup(t *testing.T) {
	r, ctx := newTabGroupRepoTestDB(t)
	id := createTestGroup(t, r, ctx, "user-1", "Work")

	// Existing group: update succeeds.
	if err := r.UpdateName(ctx, "user-1", id, "Renamed"); err != nil {
		t.Fatalf("update existing group: %v", err)
	}

	// Missing group id → NotFound, not a fake success.
	if err := r.UpdateName(ctx, "user-1", "does-not-exist", "X"); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("update missing group: want RepoErrors.NotFound, got %v", err)
	}

	// Existing group but owned by a different user → NotFound too.
	if err := r.UpdateName(ctx, "user-2", id, "X"); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("update group owned by other user: want RepoErrors.NotFound, got %v", err)
	}
}

func TestTabGroupDeleteReturnsNotFoundForMissingGroup(t *testing.T) {
	r, ctx := newTabGroupRepoTestDB(t)
	id := createTestGroup(t, r, ctx, "user-1", "Work")

	// Missing group id → NotFound, not a fake 204.
	if err := r.Delete(ctx, "user-1", "does-not-exist"); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("delete missing group: want RepoErrors.NotFound, got %v", err)
	}

	// Existing group: delete succeeds.
	if err := r.Delete(ctx, "user-1", id); err != nil {
		t.Fatalf("delete existing group: %v", err)
	}

	// Deleting again → NotFound.
	if err := r.Delete(ctx, "user-1", id); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("delete already-deleted group: want RepoErrors.NotFound, got %v", err)
	}
}

func TestTabGroupToggleCollapseReturnsNotFoundForMissingGroup(t *testing.T) {
	r, ctx := newTabGroupRepoTestDB(t)
	id := createTestGroup(t, r, ctx, "user-1", "Work")

	if err := r.ToggleCollapse(ctx, "user-1", "does-not-exist", true); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("toggle missing group: want RepoErrors.NotFound, got %v", err)
	}

	if err := r.ToggleCollapse(ctx, "user-1", id, true); err != nil {
		t.Fatalf("toggle existing group: %v", err)
	}

	g, err := r.GetByID(ctx, "user-1", id)
	if err != nil {
		t.Fatalf("get toggled group: %v", err)
	}
	if !g.Collapsed {
		t.Fatal("expected group collapsed after toggle")
	}
}

func TestTabGroupReorderReturnsNotFoundForMissingGroup(t *testing.T) {
	r, ctx := newTabGroupRepoTestDB(t)
	id1 := createTestGroup(t, r, ctx, "user-1", "A")
	id2 := createTestGroup(t, r, ctx, "user-1", "B")

	// Valid reorder succeeds.
	if err := r.Reorder(ctx, "user-1", []string{id2, id1}); err != nil {
		t.Fatalf("reorder existing groups: %v", err)
	}

	// A single unknown id in the batch → NotFound, whole batch rejected.
	if err := r.Reorder(ctx, "user-1", []string{id1, "does-not-exist"}); !errors.Is(err, RepoErrors.NotFound) {
		t.Fatalf("reorder with missing group: want RepoErrors.NotFound, got %v", err)
	}

	// Positions must be unchanged after the failed batch.
	groups, _, err := r.GetAllWithTabs(ctx, "user-1")
	if err != nil {
		t.Fatalf("get all groups: %v", err)
	}
	if len(groups) != 2 || groups[0].ID != id2 || groups[1].ID != id1 {
		t.Fatalf("positions changed after failed reorder: got %v, %v", groups[0].ID, groups[1].ID)
	}
}

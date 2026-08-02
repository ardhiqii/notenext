package repositories

import (
	"context"
	"database/sql"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type TabGroupRepository struct {
	db *sql.DB
}

func NewTabGroupRepository(db *sql.DB) *TabGroupRepository {
	return &TabGroupRepository{db}
}

func (r *TabGroupRepository) Create(ctx context.Context, userID string, name string) (*entities.TabGroup, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	id := uuid.NewString()

	// Get next position
	var positionAt int64
	posQuery := `SELECT COALESCE(MAX(position_at), 0) + 1 FROM tab_groups`
	var args []any
	if userID == "" {
		posQuery += ` WHERE user_id IS NULL`
	} else {
		posQuery += ` WHERE user_id = ?`
		args = append(args, userID)
	}
	err := r.db.QueryRowContext(ctx, posQuery, args...).Scan(&positionAt)
	if err != nil {
		return nil, err
	}

	group := &entities.TabGroup{
		ID:         id,
		Name:       name,
		PositionAt: positionAt,
		Collapsed:  false,
	}

	var insertArgs []any
	insertQuery := `INSERT INTO tab_groups (id, name, position_at, collapsed`
	if userID == "" {
		insertQuery += `) VALUES (?, ?, ?, ?) RETURNING created_at, updated_at`
		insertArgs = append(insertArgs, id, name, positionAt, false)
	} else {
		insertQuery += `, user_id) VALUES (?, ?, ?, ?, ?) RETURNING created_at, updated_at`
		insertArgs = append(insertArgs, id, name, positionAt, false, userID)
	}

	err = r.db.QueryRowContext(ctx, insertQuery, insertArgs...).Scan(&group.CreatedAt, &group.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return group, nil
}

func (r *TabGroupRepository) GetAllWithTabs(ctx context.Context, userID string) ([]*entities.TabGroup, []*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	// Fetch all groups
	var groupArgs []any
	groupQuery := `SELECT id, name, position_at, collapsed, created_at, updated_at FROM tab_groups`
	if userID == "" {
		groupQuery += ` WHERE user_id IS NULL`
	} else {
		groupQuery += ` WHERE user_id = ?`
		groupArgs = append(groupArgs, userID)
	}
	groupQuery += ` ORDER BY position_at ASC`

	groupRows, err := r.db.QueryContext(ctx, groupQuery, groupArgs...)
	if err != nil {
		return nil, nil, err
	}
	defer groupRows.Close()

	groups := make([]*entities.TabGroup, 0)
	for groupRows.Next() {
		var g entities.TabGroup
		err := groupRows.Scan(&g.ID, &g.Name, &g.PositionAt, &g.Collapsed, &g.CreatedAt, &g.UpdatedAt)
		if err != nil {
			return nil, nil, err
		}
		groups = append(groups, &g)
	}

	// Fetch all notes belonging to groups (grouped) + ungrouped notes
	var noteArgs []any
	noteQuery := `SELECT id, title, content, position_at, group_id, created_at, updated_at FROM notes`
	if userID == "" {
		noteQuery += ` WHERE user_id IS NULL`
	} else {
		noteQuery += ` WHERE user_id = ?`
		noteArgs = append(noteArgs, userID)
	}
	noteQuery += ` ORDER BY position_at ASC`

	noteRows, err := r.db.QueryContext(ctx, noteQuery, noteArgs...)
	if err != nil {
		return nil, nil, err
	}
	defer noteRows.Close()

	notes := make([]*entities.Note, 0)
	for noteRows.Next() {
		var n entities.Note
		err := noteRows.Scan(&n.ID, &n.Title, &n.Content, &n.PositionAt, &n.GroupID, &n.CreatedAt, &n.UpdatedAt)
		if err != nil {
			return nil, nil, err
		}
		notes = append(notes, &n)
	}

	return groups, notes, nil
}

func (r *TabGroupRepository) GetByID(ctx context.Context, userID, id string) (*entities.TabGroup, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var group entities.TabGroup
	var args []any

	query := `SELECT id, name, position_at, collapsed, created_at, updated_at FROM tab_groups WHERE id = ? AND (`
	if userID == "" {
		query += `user_id IS NULL)`
	} else {
		query += `user_id = ?)`
		args = append(args, userID)
	}
	args = append([]any{id}, args...)

	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&group.ID, &group.Name, &group.PositionAt, &group.Collapsed, &group.CreatedAt, &group.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *TabGroupRepository) UpdateName(ctx context.Context, userID, id, name string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any
	query := `UPDATE tab_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	args = append(args, name, id)
	if userID == "" {
		query += ` AND user_id IS NULL`
	} else {
		query += ` AND user_id = ?`
		args = append(args, userID)
	}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return RepoErrors.NotFound
	}
	return nil
}

func (r *TabGroupRepository) Delete(ctx context.Context, userID, id string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	// Notes in the group will have group_id set to NULL via ON DELETE SET NULL
	var args []any
	query := `DELETE FROM tab_groups WHERE id = ?`
	args = append(args, id)
	if userID == "" {
		query += ` AND user_id IS NULL`
	} else {
		query += ` AND user_id = ?`
		args = append(args, userID)
	}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return RepoErrors.NotFound
	}
	return nil
}

func (r *TabGroupRepository) Reorder(ctx context.Context, userID string, groupIDs []string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	// Use a transaction to batch update positions
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `UPDATE tab_groups SET position_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (`+
		func() string {
			if userID == "" {
				return "user_id IS NULL)"
			}
			return "user_id = ?)"
		}())
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, gid := range groupIDs {
		args := []any{int64(i + 1), gid}
		if userID != "" {
			args = append(args, userID)
		}
		result, err := stmt.ExecContext(ctx, args...)
		if err != nil {
			return err
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			return RepoErrors.NotFound
		}
	}

	return tx.Commit()
}

func (r *TabGroupRepository) ToggleCollapse(ctx context.Context, userID, id string, collapsed bool) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any
	query := `UPDATE tab_groups SET collapsed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	args = append(args, collapsed, id)
	if userID == "" {
		query += ` AND user_id IS NULL`
	} else {
		query += ` AND user_id = ?`
		args = append(args, userID)
	}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return RepoErrors.NotFound
	}
	return nil
}

func (r *TabGroupRepository) CountByUserID(ctx context.Context, userID string) (int32, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var count int32
	query := `SELECT COUNT(*) FROM tab_groups WHERE`
	if userID == "" {
		query += ` user_id IS NULL`
	} else {
		query += ` user_id = ?`
	}
	err := r.db.QueryRowContext(ctx, query, queryArg(userID)).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// GetLastPositionForGroup returns the next position for notes within a specific group (or ungrouped when groupID is nil)
func (r *TabGroupRepository) GetLastPositionForNotes(ctx context.Context, userID string, groupID *string) (*int64, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var positionAt int64
	var args []any
	query := `SELECT COALESCE(MAX(position_at), 0) + 1 FROM notes WHERE`

	if userID == "" {
		query += ` user_id IS NULL`
	} else {
		query += ` user_id = ?`
		args = append(args, userID)
	}

	if groupID == nil {
		query += ` AND group_id IS NULL`
	} else {
		query += ` AND group_id = ?`
		args = append(args, *groupID)
	}

	err := r.db.QueryRowContext(ctx, query, args...).Scan(&positionAt)
	if err != nil {
		return nil, err
	}
	return &positionAt, nil
}

// queryArg returns the argument for a query, handling nil/empty userID
func queryArg(userID string) any {
	if userID == "" {
		return nil
	}
	return userID
}

// Ensure TabGroupRepository implements the TabGroupRepoInterface for compile-time check
var _ TabGroupRepoInterface = (*TabGroupRepository)(nil)

// TabGroupRepoInterface describes the tab group repository methods the service needs
type TabGroupRepoInterface interface {
	Create(ctx context.Context, userID string, name string) (*entities.TabGroup, error)
	GetAllWithTabs(ctx context.Context, userID string) ([]*entities.TabGroup, []*entities.Note, error)
	GetByID(ctx context.Context, userID, id string) (*entities.TabGroup, error)
	UpdateName(ctx context.Context, userID, id, name string) error
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID string, groupIDs []string) error
	ToggleCollapse(ctx context.Context, userID, id string, collapsed bool) error
	CountByUserID(ctx context.Context, userID string) (int32, error)
	GetLastPositionForNotes(ctx context.Context, userID string, groupID *string) (*int64, error)
}

func NewTabGroupRepoInterface(db *sql.DB) TabGroupRepoInterface {
	return NewTabGroupRepository(db)
}

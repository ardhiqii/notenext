package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/google/uuid"
)

type NoteRepository struct {
	db *sql.DB
}

func NewNoteRepository(db *sql.DB) *NoteRepository {
	return &NoteRepository{db}
}

func (r *NoteRepository) Create(ctx context.Context, userID string, note *entities.Note) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	note.ID = uuid.NewString()
	var args []any

	args = append(args, note.ID, note.Title, note.Content, note.PositionAt)
	query := `
	INSERT INTO notes (id,title, content, position_at) VALUES (?,?, ?, ?)
	RETURNING created_at, updated_at
	`
	if userID != "" && note.GroupID != nil {
		query = `
	INSERT INTO notes (id,title, content, position_at,user_id, group_id) VALUES (?,?, ?, ?, ?, ?)
	RETURNING created_at, updated_at
		`
		args = append(args, userID, *note.GroupID)
	} else if userID != "" {
		query = `
	INSERT INTO notes (id,title, content, position_at,user_id) VALUES (?,?, ?, ?, ?)
	RETURNING created_at, updated_at
		`
		args = append(args, userID)
	} else if note.GroupID != nil {
		// Guest with a group_id should never reach here (service rejects it),
		// but keep the INSERT valid if it does.
		query = `
	INSERT INTO notes (id,title, content, position_at, group_id) VALUES (?,?, ?, ?, ?)
	RETURNING created_at, updated_at
		`
		args = append(args, *note.GroupID)
	}

	err := r.db.QueryRowContext(ctx, query, args...).Scan(&note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return err
	}

	return nil
}

func (r *NoteRepository) GetAll(ctx context.Context, userID string) ([]*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any

	query := `
	SELECT id, title, content, position_at, group_id, created_at, updated_at 
	FROM notes
	WHERE `
	if userID == "" {
		query += `user_id IS NULL
		ORDER BY position_at ASC`
	} else {
		query += `user_id = ?
		ORDER BY position_at ASC`
		args = append(args, userID)
	}
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := make([]*entities.Note, 0)
	for rows.Next() {
		var note entities.Note
		err := rows.Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.GroupID, &note.CreatedAt, &note.UpdatedAt)
		if err != nil {
			return nil, err
		}
		notes = append(notes, &note)
	}

	return notes, nil
}

// GetAllPublic returns only global/public notes (user_id IS NULL).
// These are the seeded "Welcome / Getting Started" notes accessible to
// everyone (including logged-in users) — surfaced in the sidebar.
func (r *NoteRepository) GetAllPublic(ctx context.Context) ([]*entities.Note, error) {
	return r.GetAll(ctx, "")
}

func (r *NoteRepository) GetLastPositionAt(ctx context.Context, userID string) (*int64, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	var positionAt int64
	query := `
	SELECT COALESCE(MAX(position_at), 0) + 1 FROM notes
	WHERE `
	var args []any
	if userID == "" {
		query += `user_id IS NULL`
	} else {
		query += `user_id = ?`
		args = append(args, userID)
	}
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&positionAt)
	if err != nil {
		return nil, err
	}
	return &positionAt, nil
}

func (r *NoteRepository) UpdateNote(ctx context.Context, userID string, req *dtos.UpdateNoteRequest) error {
	if req.Title == nil && req.Content == nil {
		return nil
	}

	// Anonymous users must never modify notes: guests own nothing to
	// update and must not be able to write to global/public notes
	// (user_id IS NULL). Public notes ARE editable by any signed-in user.
	if userID == "" {
		return RepoErrors.Forbidden
	}

	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()
	query := `
	UPDATE notes
	SET `
	args := []any{}
	argsIndex := 1

	if req.Title != nil {
		query += fmt.Sprintf("title = $%d", argsIndex)
		args = append(args, *req.Title)
		argsIndex++
	}

	if req.Content != nil {
		if argsIndex > 1 {
			query += ", "
		}
		query += fmt.Sprintf("content = $%d", argsIndex)
		args = append(args, *req.Content)
		argsIndex++
	}

	query += fmt.Sprintf(", updated_at = CURRENT_TIMESTAMP where id = $%d", argsIndex)
	args = append(args, req.ID)
	argsIndex++

	// Ownership scoping: a signed-in user can update their own notes OR
	// any global/public note (user_id IS NULL). Someone else's private
	// note still matches nothing → NotFound.
	query += fmt.Sprintf(" AND (user_id = $%d OR user_id IS NULL)", argsIndex)
	args = append(args, userID)

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return RepoErrors.NotFound
	}

	return nil

}

func (r *NoteRepository) Delete(ctx context.Context, userID string, req *dtos.DeleteNoteRequest) error {
	// Anonymous users must never delete notes: global/public notes
	// (user_id IS NULL) are never deletable via the API, and guests own
	// nothing to delete.
	if userID == "" {
		return RepoErrors.Forbidden
	}

	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	// Ownership guard: a user can only delete their own notes.
	query := `
	DELETE FROM notes
	WHERE id = $1 AND user_id = $2
	`
	args := []any{req.ID, userID}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return RepoErrors.NotFound
	}
	return nil
}

func (r *NoteRepository) GetById(ctx context.Context, userID string, req *dtos.GetNoteRequest) (*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var note entities.Note
	var args []any

	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
	`
	args = append(args, req.ID, userID)

	row := r.db.QueryRowContext(ctx, query, args...)
	err := row.Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.CreatedAt, &note.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, RepoErrors.NotFound
	}
	if err != nil {
		return nil, err
	}
	return &note, nil

}

func (r *NoteRepository) GetByIds(ctx context.Context, userID string, ids []string) ([]*entities.Note, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	if len(ids) == 0 {
		return []*entities.Note{}, nil
	}

	query := `
	SELECT id, title, content, position_at, created_at, updated_at 
	FROM notes
	WHERE id IN (`

	args := make([]any, 0, len(ids)+1)
	for i, id := range ids {
		if i > 0 {
			query += ", "
		}
		query += fmt.Sprintf("$%d", i+1)
		args = append(args, id)
	}
	query += ")"

	// Ownership scoping: a user may only export their own notes plus the
	// global/public ones; guests may only export global notes.
	if userID == "" {
		query += " AND user_id IS NULL"
	} else {
		query += fmt.Sprintf(" AND (user_id = $%d OR user_id IS NULL)", len(ids)+1)
		args = append(args, userID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := make([]*entities.Note, 0)
	for rows.Next() {
		var note entities.Note
		err := rows.Scan(&note.ID, &note.Title, &note.Content, &note.PositionAt, &note.CreatedAt, &note.UpdatedAt)
		if err != nil {
			return nil, err
		}
		notes = append(notes, &note)
	}

	return notes, nil
}

func (r *NoteRepository) UpdateTabPosition(ctx context.Context, userID string, req *dtos.UpdateTabPositionRequest) error {
	// Anonymous users must never modify notes: global/public notes are
	// read-only, and guests own nothing to reposition.
	if userID == "" {
		return RepoErrors.Forbidden
	}

	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	query := `UPDATE notes SET position_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`

	result, err := r.db.ExecContext(ctx, query, req.PositionAt, req.ID, userID)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return RepoErrors.NotFound
	}

	return nil
}

func (r *NoteRepository) AssignNoteToGroup(ctx context.Context, userID, noteID string, groupID *string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any
	query := `UPDATE notes SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	args = append(args, groupID, noteID)
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

func (r *NoteRepository) ReorderTabsInGroup(ctx context.Context, userID, groupID string, tabIDs []string) error {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Build the ownership check clause
	ownershipClause := `user_id IS NULL`
	ownershipArgs := []any{}
	if userID != "" {
		ownershipClause = `user_id = ?`
		ownershipArgs = append(ownershipArgs, userID)
	}

	stmt, err := tx.PrepareContext(ctx,
		`UPDATE notes SET position_at = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND group_id = ? AND (`+ownershipClause+`)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, tabID := range tabIDs {
		args := []any{int64(i + 1), tabID, groupID}
		args = append(args, ownershipArgs...)
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

func (r *NoteRepository) CountByUserID(ctx context.Context, userID string) (int32, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	var args []any
	var count int32

	query := `
	SELECT COUNT(*)
	FROM notes
	WHERE user_id IS NULL
	`
	if userID != "" {
		query = `
		SELECT COUNT(*)
		FROM notes
		WHERE user_id = ?
		`
		args = append(args, userID)
	}

	row := r.db.QueryRowContext(ctx, query, args...)
	err := row.Scan(&count)

	if err != nil {
		return 0, err
	}

	return count, nil
}

// SearchNoteResult is one row returned by SearchNotes: the note fields plus
// its group name (nil when the note is ungrouped) and a content snippet
// centered on the first case-insensitive match of the query.
type SearchNoteResult struct {
	ID             string
	Title          string
	Content        string
	ContentSnippet string
	PositionAt     int64
	GroupID        *string
	GroupName      *string
}

// SearchNotes finds up to limit notes whose title or content contains q.
// Guests (userID == "") see global notes (user_id IS NULL); logged-in users
// see their own notes plus global ones. Results are ordered title-match first,
// then by most recently updated.
//
// q is matched literally — LIKE wildcards (%, _) and the escape char in user
// input are escaped so a query of "%" cannot match everything.
func (r *NoteRepository) SearchNotes(ctx context.Context, userID, q string, limit int) ([]*SearchNoteResult, error) {
	ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
	defer cancel()

	pattern := "%" + escapeLike(q) + "%"

	query := `
	SELECT n.id, n.title, n.content, n.position_at, n.group_id, g.name
	FROM notes n
	LEFT JOIN tab_groups g ON g.id = n.group_id
	WHERE (n.title LIKE ? ESCAPE '\' OR n.content LIKE ? ESCAPE '\')
	  AND (n.user_id = ? OR n.user_id IS NULL)
	ORDER BY (n.title LIKE ? ESCAPE '\') DESC, n.updated_at DESC
	LIMIT ?
	`

	rows, err := r.db.QueryContext(ctx, query, pattern, pattern, userID, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]*SearchNoteResult, 0)
	for rows.Next() {
		var (
			res       SearchNoteResult
			groupID   sql.NullString
			groupName sql.NullString
		)
		// group_id and g.name can be NULL — scan into sql.NullString, never
		// into a plain string (scanning NULL into string errors).
		if err := rows.Scan(&res.ID, &res.Title, &res.Content, &res.PositionAt, &groupID, &groupName); err != nil {
			return nil, err
		}
		if groupID.Valid {
			res.GroupID = &groupID.String
		}
		if groupName.Valid {
			res.GroupName = &groupName.String
		}
		res.ContentSnippet = buildContentSnippet(res.Content, q)
		results = append(results, &res)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// escapeLike escapes LIKE wildcards in user input so they are matched
// literally when used with ESCAPE '\'. Backslash must be escaped first,
// otherwise a user-supplied backslash would neutralize our escaping.
func escapeLike(q string) string {
	q = strings.ReplaceAll(q, `\`, `\\`)
	q = strings.ReplaceAll(q, `%`, `\%`)
	q = strings.ReplaceAll(q, `_`, `\_`)
	return q
}

// buildContentSnippet extracts a ~160-rune window of content STARTING just
// before the first case-insensitive match of q (small lead-in context), so the
// match is near the LEFT edge of the snippet and survives one-line CSS
// truncation in the UI. A centered window pushed the match past the visible
// area when earlier content (e.g. long URLs) filled the first half — the
// highlight then rendered off-screen. Returns "" for empty content or when q
// has no content match.
func buildContentSnippet(content, q string) string {
	if content == "" || q == "" {
		return ""
	}

	lowerContent := strings.ToLower(content)
	matchIdx := strings.Index(lowerContent, strings.ToLower(q))
	if matchIdx == -1 {
		return ""
	}

	const windowSize = 160
	// Small lead-in so the match is at ~position 24 of the snippet, not at 0.
	const leadContext = 24
	contentRunes := []rune(content)
	// Rune offset of the match (matchIdx is a byte offset into the lowered
	// string; for byte-length-preserving lowercasing this equals the rune
	// count of content[:matchIdx]).
	matchRune := utf8.RuneCountInString(lowerContent[:matchIdx])

	start := matchRune - leadContext
	if start < 0 {
		start = 0
	}
	end := start + windowSize
	if end > len(contentRunes) {
		end = len(contentRunes)
	}

	snippet := string(contentRunes[start:end])
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(contentRunes) {
		snippet += "…"
	}
	return snippet
}

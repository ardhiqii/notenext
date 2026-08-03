package dtos

type CreateNoteRequest struct {
	GroupID *string `json:"group_id,omitempty"`
}

type CreateNoteResponse struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	PositionAt int64   `json:"position_at"`
	GroupID    *string `json:"group_id,omitempty"`
}

func NewCreateNoteResponse(id string, title string, content string, positionAt int64, groupID *string) *CreateNoteResponse {
	return &CreateNoteResponse{
		ID:         id,
		Title:      title,
		Content:    content,
		PositionAt: positionAt,
		GroupID:    groupID,
	}
}

type NoteResponse struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	PositionAt int64   `json:"position_at"`
	GroupID    *string `json:"group_id,omitempty"`
}

func NewNoteResponse(id string, title string, content string, positionAt int64, groupID *string) *NoteResponse {
	return &NoteResponse{
		ID:         id,
		Title:      title,
		Content:    content,
		PositionAt: positionAt,
		GroupID:    groupID,
	}
}

type TabResponse struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	PositionAt int64   `json:"position_at"`
	GroupID    *string `json:"group_id,omitempty"`
}

// SearchNoteResponse is one note result from GET /notes/search.
// GroupID and GroupName serialize as null (not omitted) when the note is
// ungrouped, matching the documented string|null contract.
type SearchNoteResponse struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	ContentSnippet string  `json:"content_snippet"`
	PositionAt     int64   `json:"position_at"`
	GroupID        *string `json:"group_id"`
	GroupName      *string `json:"group_name"`
}

type UpdateNoteRequest struct {
	ID      string  `uri:"id" binding:"required"`
	Title   *string `json:"title"`
	Content *string `json:"content"`
}

type DeleteNoteRequest struct {
	ID string `uri:"id" binding:"required"`
}

type GetNoteRequest struct {
	ID string `uri:"id" binding:"required"`
}

type GetNoteResponse struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	PositionAt int64  `json:"position_at"`
}

type UpdateTabPositionRequest struct {
	ID         string `uri:"id" binding:"required"`
	PositionAt int64  `json:"position_at" binding:"required"`
}

type ExportNoteResponse struct {
	Version    string       `json:"version"`
	ExportedAt string       `json:"exportedAt"`
	Notes      []NoteExport `json:"notes"`
}

type NoteExport struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	PositionAt int64  `json:"positionAt"`
}

type ImportNotesRequest struct {
	Version string       `json:"version"`
	Notes   []ImportNote `json:"notes"`
}

type ImportNote struct {
	Title      string `json:"title"`
	Content    string `json:"content"`
	PositionAt int64  `json:"positionAt,omitempty"`
}

type ImportNotesResponse struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	NoteIds  []string `json:"noteIds"`
}

type ExportNotesRequest struct {
	NoteIds []string `json:"noteIds" binding:"required"`
}

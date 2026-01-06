package dtos


type CreateNoteResponse struct {
	ID string `json:"id"`
	Title string `json:"title"`
	Content string `json:"content"`
	PositionAt int64 `json:"position_at"`
}

func NewCreateNoteResponse(id string, title string, content string, positionAt int64) *CreateNoteResponse {
	return &CreateNoteResponse{
		ID: id,
		Title: title,
		Content: content,
		PositionAt: positionAt,
	}
}


type NoteResponse struct {
	ID string `json:"id"`
	Title string `json:"title"`
	Content string `json:"content"`
	PositionAt int64 `json:"position_at"`
}

func NewNoteResponse(id string, title string, content string, positionAt int64) *NoteResponse {
	return &NoteResponse{
		ID: id,
		Title: title,
		Content: content,
		PositionAt: positionAt,
	}
}

type TabResponse struct {
	ID string `json:"id"`
	Title string `json:"title"`
	PositionAt int64 `json:"position_at"`
}


type UpdateContentNoteRequest struct {
	ID string `uri:"id" binding:"required"`
	Content string `json:"content"`
}

type DeleteNoteRequest struct {
	ID string `uri:"id" binding:"required"`
}

type GetNoteRequest struct {
	ID string `uri:"id" binding:"required"`
}

type GetNoteResponse struct {
	ID string `json:"id"`
	Title string `json:"title"`
	Content string `json:"content"`
	PositionAt int64 `json:"position_at"`
}

type UpdateTabPositionRequest struct {
	ID string `uri:"id" binding:"required"`
	PositionAt int64 `json:"position_at" binding:"required"`
}
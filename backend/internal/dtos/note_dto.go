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
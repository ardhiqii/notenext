package dtos


type CreateNoteResponse struct {
	ID int64 `json:"id"`
	Title string `json:"title"`
	Content string `json:"content"`
	PosistionAt int64 `json:"position_at"`
}
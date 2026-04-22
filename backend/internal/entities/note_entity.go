package entities

type Note struct {
	ID         string
	Title      string
	UserID     *string
	Content    string
	PositionAt int64
	CreatedAt  string
	UpdatedAt  string
}

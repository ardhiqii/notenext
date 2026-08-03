package entities

type TabGroup struct {
	ID         string
	UserID     *string
	Name       string
	PositionAt int64
	Collapsed  bool
	CreatedAt  string
	UpdatedAt  string
}

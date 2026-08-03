package entities

type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt string
	CreatedAt string
}

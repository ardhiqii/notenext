package entities

type User struct {
	ID                       string
	Username                 string
	Email                    string
	Name                     string
	AvatarURL                string
	PasswordHash             string
	LastSeenChangelogVersion string
	CreatedAt                string
	UpdatedAt                string
}

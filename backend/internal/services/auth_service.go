package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

type AuthService struct {
	db          *sql.DB
	userRepo    *repositories.UserRepository
	oauthRepo   *repositories.OAuthAccountRepository
	oauthConfig *configs.OAuthConfig
}

type stateClaims struct {
	Verifier string `json:"verifier"`
	jwt.RegisteredClaims
}

func NewAuthService(db *sql.DB, userRepo *repositories.UserRepository, oauthRepo *repositories.OAuthAccountRepository, oauthConfig *configs.OAuthConfig) *AuthService {
	return &AuthService{
		db,
		userRepo,
		oauthRepo,
		oauthConfig,
	}
}

func (s *AuthService) GetGoogleAuthURL() (string, error) {
	verfier := oauth2.GenerateVerifier()
	state, err := s.generateStateToken(verfier)
	if err != nil {
		return "", err
	}
	url := s.oauthConfig.Google.AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verfier))
	return url, nil
}

func (s *AuthService) GoogleCallback(ctx context.Context, code string, state string) (string, error) {
	claims, err := s.validateStateToken(state)
	if err != nil {
		return "", err
	}
	token_google, err := s.oauthConfig.Google.Exchange(ctx, code, oauth2.VerifierOption(claims.Verifier))
	if err != nil {
		return "", err
	}
	client := s.oauthConfig.Google.Client(ctx, token_google)
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var googleUser struct {
		ID      string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}

	err = json.NewDecoder(resp.Body).Decode(&googleUser)
	if err != nil {
		return "", err
	}

	user := &entities.User{
		Email:     googleUser.Email,
		AvatarURL: googleUser.Picture,
		Name:      googleUser.Name,
	}

	userId, err := s.oauthRepo.FindByProviderID(ctx, "google", googleUser.ID)
	if err != nil {
		return "", err
	}

	if userId == "" {
		err := database.WithTx(s.db, ctx, func(tx *sql.Tx) error {
			userRepoTx := repositories.NewUserRepository(tx)
			oauthRepoTx := repositories.NewOAuthAccountRepository(tx)

			user, err = userRepoTx.Create(ctx, user)
			if err != nil {
				return err
			}
			oauthAccount := &entities.OAuthAccount{
				UserID:     user.ID,
				Provider:   "google",
				ProviderID: googleUser.ID,
			}
			_, err = oauthRepoTx.Create(ctx, oauthAccount)
			if err != nil {
				return err
			}
			userId = user.ID
			return nil
		})

		if err != nil {
			return "", err
		}

	}
	token, err := s.generateAppToken(userId)
	if err != nil{
		return "",err
	}

	return "http://localhost:5173#token=" + token, nil
}

func (s *AuthService) generateStateToken(verfier string) (string, error) {
	claims := stateClaims{
		Verifier: verfier,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.oauthConfig.JWTSecret))
}

func (s *AuthService) validateStateToken(state string) (*stateClaims, error) {
	claims := &stateClaims{}
	_, err := jwt.ParseWithClaims(state, claims, func(t *jwt.Token) (any, error) {
		return []byte(s.oauthConfig.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

func (s *AuthService) generateAppToken(userID string) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.oauthConfig.JWTSecret))
}

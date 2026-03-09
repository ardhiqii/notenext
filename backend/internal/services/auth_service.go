package services

import (
	"context"
	"encoding/json"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

type AuthService struct {
	userRepo    *repositories.UserRepository
	oauthConfig *configs.OAuthConfig
}

type stateClaims struct {
	Verifier string `json:"verifier"`
	jwt.RegisteredClaims
}

func NewAuthService(userRepo *repositories.UserRepository, oauthConfig *configs.OAuthConfig) *AuthService {
	return &AuthService{
		userRepo,
		oauthConfig,
	}
}

func (a *AuthService) GetGoogleAuthURL() (string, error) {
	verfier := oauth2.GenerateVerifier()
	state, err := a.generateStateToken(verfier)
	if err != nil {
		// Error handling
		return "", err
	}
	url := a.oauthConfig.Google.AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verfier))
	return url, nil
}

func (a *AuthService) GoogleCallback(ctx context.Context, code string, state string) (string, error) {
	claims, err := a.validateStateToken(state)
	if err != nil {
		return "", err
	}
	token_google, err := a.oauthConfig.Google.Exchange(ctx, code, oauth2.VerifierOption(claims.Verifier))
	if err != nil {
		return "", err
	}
	client := a.oauthConfig.Google.Client(ctx, token_google)
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var googleUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	json.NewDecoder(resp.Body).Decode(&googleUser)

	// ### TODO ###
	// [ ] Generate app token with user id from our db

	token, err := a.generateAppToken("TEST_USER_ID")

	return "http://localhost:5173#token=" + token, nil
}

func (a *AuthService) generateStateToken(verfier string) (string, error) {
	claims := stateClaims{
		Verifier: verfier,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte("TEST"))
}

func (a *AuthService) validateStateToken(state string) (*stateClaims, error) {
	claims := &stateClaims{}
	_, err := jwt.ParseWithClaims(state, claims, func(t *jwt.Token) (any, error) {
		return []byte("TEST"), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

func (a *AuthService) generateAppToken(userID string) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte("TEST"))
}

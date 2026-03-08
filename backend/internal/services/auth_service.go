package services

import (
	"time"

	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)


type AuthService struct {
	userRepo *repositories.UserRepository
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

func (a *AuthService) GetGoogleAuthURL() (string,error){
	verfier := oauth2.GenerateVerifier()
	state,err := a.generateStateToken(verfier);
	if err != nil{
		// Error handling
		return "",err
	}
	url := a.oauthConfig.Google.AuthCodeURL(state,oauth2.AccessTypeOnline,oauth2.S256ChallengeOption(verfier))
	return url, nil
}

func (a *AuthService) GoogleCallback(){
	
}


func (a *AuthService) generateStateToken(verfier string) (string,error){
	claims := stateClaims{
		Verifier: verfier,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256,claims)
	return token.SignedString([]byte("TEST"))
}

func (a *AuthService) validateStateToken(state string) (*stateClaims,error){
	claims := &stateClaims{}
	_,err := jwt.ParseWithClaims(state, claims, func(t *jwt.Token) (any, error) {
		return []byte("TEST"),nil
	})
	if err != nil{
		return nil,err
	}
	return claims, nil
}
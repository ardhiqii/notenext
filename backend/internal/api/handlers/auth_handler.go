package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type AuthHandler struct {
	authService *services.AuthService
	frontendURL string
}

type RefreshTokenCookie struct {
	Name     string
	Value    string
	MaxAge   int
	Path     string
	Domain   string
	Secure   bool
	HttpOnly bool
}

func NewAuthHandler(authService *services.AuthService, frontendURL string) *AuthHandler {
	return &AuthHandler{
		authService,
		frontendURL,
	}
}

func (a *AuthHandler) GetMe(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	user, err := a.authService.GetMe(ctx.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "user not found")
			log.Error().Err(err).Msg("user not found")
			return
		}
		api.InternalServerError(ctx, "failed to get user")
		log.Error().Err(err).Msg("Failed to get user data me")
		return
	}
	type dtoResponse struct {
		
		ID        string `json:"id"`
		Email     string `json:"email,omitempty"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url,omitempty"`
	}
	var resp = dtoResponse{
		ID: user.ID,
		Email: user.Email,
		Name: user.Name,
		AvatarURL: user.AvatarURL,
	}
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (a *AuthHandler) RefreshAccessToken(ctx *gin.Context) {
	refreshToken, err := ctx.Cookie("refresh_token")
	if err != nil {
		api.UnauthorizedResponse(ctx, "missing refresh token")
		return
	}

	token, err := a.authService.GenerateAccessTokenWithRefreshToken(ctx.Request.Context(), refreshToken)
	fmt.Printf("TEST TOKEN %s", token)

	if err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "user or refresh token not found")
			log.Error().Err(err).Msg("user or refresh token not found")
			return
		}
		api.InternalServerError(ctx, "failed to generate access token")
		log.Error().Err(err).Msg("failed to generate access token")
		return
	}

	type AccessTokenResponse struct {
		AccessToken string `json:"access_token"`
	}
	var response = AccessTokenResponse{
		AccessToken: token,
	}
	api.JsonResponse(ctx, http.StatusOK, response)
}

func (a *AuthHandler) GoogleLogin(ctx *gin.Context) {
	url, err := a.authService.GetGoogleAuthURL()
	if err != nil {
		api.InternalServerError(ctx, "Failed to get Google Login URL")
		log.Error().Err(err).Msg("Error to get Google Login URL")
		return
	}
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

func (a *AuthHandler) GoogleCallback(ctx *gin.Context) {
	code := ctx.Query("code")
	state := ctx.Query("state")
	if code == "" || state == "" {
		api.BadRequestResponse(ctx, "Missing code or state")
		return
	}
	authToken, err := a.authService.GoogleCallback(ctx.Request.Context(), code, state)
	if err != nil {
		api.InternalServerError(ctx, "Error google callback")
		log.Error().Err(err).Msg("Error google callback")
	}

	cookieConfig := &RefreshTokenCookie{
		Name:     "refresh_token",
		Value:    authToken.RefreshToken,
		MaxAge:   authToken.ExpiresAt,
		Path:     "/api/v1/auth/refresh",
		Domain:   "",
		Secure:   false,
		HttpOnly: true,
	}

	ctx.SetCookie(cookieConfig.Name,
		cookieConfig.Value,
		cookieConfig.MaxAge,
		cookieConfig.Path,
		cookieConfig.Domain,
		cookieConfig.Secure,
		cookieConfig.HttpOnly)

	url := a.frontendURL + "#token=" + authToken.AccessToken
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

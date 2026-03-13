package handlers

import (
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{
		authService,
	}
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
	authToken, err := a.authService.GoogleCallback(ctx, code, state)
	if err != nil {
		api.InternalServerError(ctx, "Error google callback")
		log.Error().Err(err).Msg("Error google callback")
	}
	ctx.SetCookie("refresh_token",authToken.RefreshToken, authToken.ExpiresAt,"/api/v1/auth/refresh", "", false,true)
	url := "http://localhost:5173#token=" + authToken.AccessToken
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

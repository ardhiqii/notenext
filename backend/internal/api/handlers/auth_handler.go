package handlers

import (
	"errors"
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

// ──────────────────────────────────────────────
// Username/Password Auth
// ──────────────────────────────────────────────

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Name     string `json:"name" binding:"required"`
}

func (a *AuthHandler) Register(ctx *gin.Context) {
	var req RegisterRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "username, password, and name are required")
		return
	}

	authToken, err := a.authService.Register(ctx.Request.Context(), req.Username, req.Password, req.Name)
	if err != nil {
		if errors.Is(err, repositories.ErrUsernameTaken) {
			api.JsonResponse(ctx, http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		api.BadRequestResponse(ctx, err.Error())
		log.Error().Err(err).Msg("registration failed")
		return
	}

	a.setAuthCookie(ctx, authToken)
	type TokenResponse struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresAt    int    `json:"expires_at"`
	}
	api.JsonResponse(ctx, http.StatusCreated, TokenResponse{
		AccessToken:  authToken.AccessToken,
		RefreshToken: authToken.RefreshToken,
		ExpiresAt:    authToken.ExpiresAt,
	})
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (a *AuthHandler) Login(ctx *gin.Context) {
	var req LoginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "username and password are required")
		return
	}

	authToken, err := a.authService.Login(ctx.Request.Context(), req.Username, req.Password)
	if err != nil {
		api.UnauthorizedResponse(ctx, err.Error())
		log.Error().Err(err).Msg("login failed")
		return
	}

	a.setAuthCookie(ctx, authToken)
	type TokenResponse struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresAt    int    `json:"expires_at"`
	}
	api.JsonResponse(ctx, http.StatusOK, TokenResponse{
		AccessToken:  authToken.AccessToken,
		RefreshToken: authToken.RefreshToken,
		ExpiresAt:    authToken.ExpiresAt,
	})
}

// ──────────────────────────────────────────────
// Password Binding (Google → Password)
// ──────────────────────────────────────────────

type SetPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

func (a *AuthHandler) SetPassword(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req SetPasswordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "password is required")
		return
	}

	if err := a.authService.SetPassword(ctx.Request.Context(), userID, req.Password); err != nil {
		api.BadRequestResponse(ctx, err.Error())
		log.Error().Err(err).Msg("set password failed")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// ──────────────────────────────────────────────
// Username Binding (Google → Username)
// ──────────────────────────────────────────────

type SetUsernameRequest struct {
	Username string `json:"username" binding:"required"`
}

func (a *AuthHandler) SetUsername(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req SetUsernameRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "username is required")
		return
	}

	if err := a.authService.SetUsername(ctx.Request.Context(), userID, req.Username); err != nil {
		api.BadRequestResponse(ctx, err.Error())
		log.Error().Err(err).Msg("set username failed")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

type SetCredentialsRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// SetCredentials sets username AND password in one atomic operation. This is
// the Settings "set up username & password" form — the user must set BOTH at
// once, so the login method can never be left half-configured.
func (a *AuthHandler) SetCredentials(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req SetCredentialsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "username and password are required")
		return
	}

	if err := a.authService.SetCredentials(ctx.Request.Context(), userID, req.Username, req.Password); err != nil {
		if errors.Is(err, repositories.ErrUsernameTaken) {
			api.JsonResponse(ctx, http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		api.BadRequestResponse(ctx, err.Error())
		log.Error().Err(err).Msg("set credentials failed")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// ──────────────────────────────────────────────
// Google Binding (Password → Google)
// ──────────────────────────────────────────────

func (a *AuthHandler) BindGoogle(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	url, err := a.authService.GetGoogleBindURL(userID)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get Google bind URL")
		log.Error().Err(err).Msg("Error getting Google bind URL")
		return
	}
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

func (a *AuthHandler) BindGoogleCallback(ctx *gin.Context) {
	code := ctx.Query("code")
	state := ctx.Query("state")
	if code == "" || state == "" {
		api.BadRequestResponse(ctx, "Missing code or state")
		return
	}

	authToken, err := a.authService.GoogleCallback(ctx.Request.Context(), code, state)
	if err != nil {
		if errors.Is(err, services.ErrBindRequiresAuth) {
			api.UnauthorizedResponse(ctx, "please sign in before binding a Google account")
			return
		}
		if errors.Is(err, services.ErrInvalidStateToken) {
			api.BadRequestResponse(ctx, "invalid or expired state token")
			return
		}
		api.InternalServerError(ctx, "Error google binding callback")
		log.Error().Err(err).Msg("Error google binding callback")
		return
	}

	a.setAuthCookie(ctx, authToken)
	url := a.frontendURL + "#token=" + authToken.AccessToken
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

// ──────────────────────────────────────────────
// Google OAuth
// ──────────────────────────────────────────────

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
		ID                       string `json:"id"`
		Username                 string `json:"username,omitempty"`
		Email                    string `json:"email,omitempty"`
		Name                     string `json:"name"`
		AvatarURL                string `json:"avatar_url,omitempty"`
		HasPassword              bool   `json:"has_password"`
		LastSeenChangelogVersion string `json:"last_seen_changelog_version,omitempty"`
	}
	var resp = dtoResponse{
		ID:                       user.ID,
		Username:                 user.Username,
		Email:                    user.Email,
		Name:                     user.Name,
		AvatarURL:                user.AvatarURL,
		HasPassword:              user.PasswordHash != "",
		LastSeenChangelogVersion: user.LastSeenChangelogVersion,
	}
	api.JsonResponse(ctx, http.StatusOK, resp)
}

type markChangelogSeenRequest struct {
	Version string `json:"version" binding:"required"`
}

func (a *AuthHandler) MarkChangelogSeen(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)

	var req markChangelogSeenRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "version is required")
		return
	}

	if err := a.authService.MarkChangelogSeen(ctx.Request.Context(), userID, req.Version); err != nil {
		api.InternalServerError(ctx, "failed to mark changelog seen")
		log.Error().Err(err).Msg("failed to mark changelog seen")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusNoContent)
}

func (a *AuthHandler) RefreshAccessToken(ctx *gin.Context) {
	refreshToken, err := ctx.Cookie("refresh_token")
	if err != nil {
		api.UnauthorizedResponse(ctx, "missing refresh token")
		return
	}

	token, err := a.authService.GenerateAccessTokenWithRefreshToken(ctx.Request.Context(), refreshToken)

	if err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.UnauthorizedResponse(ctx, "invalid or expired refresh token")
			log.Error().Err(err).Msg("invalid or expired refresh token")
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
		return
	}

	a.setAuthCookie(ctx, authToken)
	url := a.frontendURL + "#token=" + authToken.AccessToken
	ctx.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *AuthHandler) Logout(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	err := h.authService.Logout(ctx.Request.Context(), userID)
	if err != nil {
		api.InternalServerError(ctx, "failed to logout")
		log.Error().Err(err).Msg("failed to logout")
		return
	}

	cookieConfig := &RefreshTokenCookie{
		Name:     "refresh_token",
		Value:    "",
		MaxAge:   -1,
		Path:     "/api/v1/auth/refresh",
		Domain:   "",
		Secure:   true,
		HttpOnly: true,
	}

	ctx.SetCookie(cookieConfig.Name,
		cookieConfig.Value,
		cookieConfig.MaxAge,
		cookieConfig.Path,
		cookieConfig.Domain,
		cookieConfig.Secure,
		cookieConfig.HttpOnly)

	api.StatusCodeResponse(ctx, http.StatusNoContent)
}

// ### Ticket for Websocket ###
func (h *AuthHandler) GenerateWebsocketToken(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	token, err := h.authService.GenerateTokenWithUserID(userID, services.TokenDuration.WebsocketToken)
	if err != nil {
		api.InternalServerError(ctx, "failed generate websocket token")
		log.Error().Err(err).Msg("failed generate websocket token")
		return
	}

	type WebsocketTicketResponse struct {
		WebsocketTicket string `json:"ws_ticket"`
	}

	api.JsonResponse(ctx, http.StatusOK, WebsocketTicketResponse{
		WebsocketTicket: token,
	})
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

func (a *AuthHandler) setAuthCookie(ctx *gin.Context, authToken *services.AuthToken) {
	ctx.SetCookie("refresh_token",
		authToken.RefreshToken,
		authToken.ExpiresAt,
		"/api/v1/auth/refresh",
		"",
		true,
		true)
}

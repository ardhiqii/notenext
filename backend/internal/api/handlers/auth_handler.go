package handlers

import "github.com/ardhiqii/notenext/backend/internal/services"

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService ) *AuthHandler {
	return &AuthHandler{
		authService,
	}
}

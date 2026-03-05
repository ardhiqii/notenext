package services

import "github.com/ardhiqii/notenext/backend/internal/repositories"

type AuthService struct {
	userRepo *repositories.UserRepository
}

func NewAuthService(userRepo *repositories.UserRepository) *AuthService {
	return &AuthService{
		userRepo,
	}
}
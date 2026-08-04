package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterAuthRoutes(route *gin.RouterGroup, authMiddleware gin.HandlerFunc, h *handlers.AuthHandler) {
	auth := route.Group("/auth")
	{
		// Username/Password auth
		auth.POST("/register", h.Register)
		auth.POST("/login", h.Login)

		// Google OAuth
		auth.GET("/google", h.GoogleLogin)
		auth.GET("/google/callback", h.GoogleCallback)

		// Token management
		auth.GET("/refresh", h.RefreshAccessToken)

		// Protected routes
		auth.GET("/me", authMiddleware, h.GetMe)
		auth.POST("/logout", authMiddleware, h.Logout)
		auth.POST("/ws-ticket", authMiddleware, h.GenerateWebsocketToken)

		// Account binding (protected)
		auth.POST("/bind/username", authMiddleware, h.SetUsername)
		auth.POST("/bind/password", authMiddleware, h.SetPassword)
		auth.POST("/bind/credentials", authMiddleware, h.SetCredentials)
		auth.GET("/bind/google", authMiddleware, h.BindGoogle)
		auth.GET("/bind/google/callback", h.BindGoogleCallback)

		// Changelog ("What's New" popup)
		auth.POST("/changelog-seen", authMiddleware, h.MarkChangelogSeen)
	}
}

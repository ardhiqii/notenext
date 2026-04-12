package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)


func RegisterAuthRoutes(route *gin.RouterGroup,authMiddleware gin.HandlerFunc, h *handlers.AuthHandler){
	auth := route.Group("/auth")
	{
		auth.GET("/google", h.GoogleLogin)
		auth.GET("/google/callback",h.GoogleCallback)
		auth.GET("/refresh",h.RefreshAccessToken)
		
		auth.GET("/me", authMiddleware, h.GetMe)
		auth.POST("/logout",authMiddleware,h.Logout)
		
		auth.POST("/ws-ticket", authMiddleware,h.GenerateWebsocketToken)
	}
}
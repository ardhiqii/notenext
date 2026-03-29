package middleware

import (
	"strings"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
)

func RequireAuth(authService *services.AuthService) gin.HandlerFunc{
	return func(ctx *gin.Context) {
		authHeader := ctx.GetHeader("Authorization")
		if authHeader == ""{
			api.UnauthorizedResponse(ctx,"missing authorization header")
			ctx.Abort()
			return
		}
		parts := strings.SplitN(authHeader," ", 2)
		if len(parts) != 2 || parts[0] != "Bearer"{
			api.UnauthorizedResponse(ctx,"invalid authorization format")
			ctx.Abort()
			return 
		}
		claims, err := authService.ValidateToken(parts[1])
		if err != nil{
			api.UnauthorizedResponse(ctx,"invalid or expired token")
			ctx.Abort()
			return 
		}
		ctx.Set(constants.ContextKeys.UserID, claims.Subject)
		ctx.Next()
	}
}
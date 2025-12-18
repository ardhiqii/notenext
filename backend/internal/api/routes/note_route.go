package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, noteHandler *handlers.NoteHandler) {
	notes := route.Group("/note")
	{
		notes.POST("", noteHandler.CreateNote)
		notes.GET("", func(ctx *gin.Context) {
			ctx.JSON(200, gin.H{"message": "List Notes - to be implemented"})
		})
		// notes.GET("/:id", noteHandler.GetNote)
		// notes.PUT("/:id", noteHandler.UpdateNote)
		// notes.DELETE("/:id", noteHandler.DeleteNote)
	}
}

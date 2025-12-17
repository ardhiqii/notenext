package routes

import (
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, noteHandler *handlers.NoteHandler) {
	notes := route.Group("/note")
	{
		notes.POST("", noteHandler.CreateNote)
		notes.GET("", func(ctx *gin.Context) {
			ctx.JSON(http.StatusOK, gin.H{"message": "Get all notes"})
		})
		// notes.GET("", noteHandler.GetAllNotes)
		// notes.GET("/:id", noteHandler.GetNote)
		// notes.PUT("/:id", noteHandler.UpdateNote)
		// notes.DELETE("/:id", noteHandler.DeleteNote)
	}
}

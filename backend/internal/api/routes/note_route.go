package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, noteHandler *handlers.NoteHandler) {
	notes := route.Group("/notes")
	{
		notes.POST("", noteHandler.CreateNote)
		notes.GET("", noteHandler.GetAllNotes)
		// notes.GET("/:id", noteHandler.GetNote)
		// notes.PUT("/:id", noteHandler.UpdateNote)

		// Only note
		notes.GET("/:id",noteHandler.GetNoteById)
		notes.PATCH("/:id/content",noteHandler.UpdateContentNote)
		notes.DELETE("/:id", noteHandler.DeleteNote)
	}

	tabs := notes.Group("/tabs")
	{
		tabs.PATCH("/:id")
	}
}

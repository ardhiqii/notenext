package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/api/handlers/websocket"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, noteHandler *handlers.NoteHandler, hub *websocket.Hub) {
	notes := route.Group("/notes")
	{
		notes.POST("", noteHandler.CreateNote)
		notes.GET("", noteHandler.GetAllNotes)

		// Only note
		notes.GET("/:id", noteHandler.GetNoteById)
		notes.PATCH("/:id", noteHandler.UpdateNote)
		notes.DELETE("/:id", noteHandler.DeleteNote)

		notes.GET("/:id/ws", func(ctx *gin.Context) {
			noteHandler.WsNoteById(ctx, hub)
		})
	}

	tabs := notes.Group("/tabs")
	{
		tabs.PATCH("/:id")
	}
}

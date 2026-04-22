package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/api/handlers/websocket"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, authMiddleware gin.HandlerFunc, noteHandler *handlers.NoteHandler, hub *websocket.Hub) {

	notes := route.Group("/notes")
	{
		notes.POST("", authMiddleware, noteHandler.CreateNote)
		notes.GET("", authMiddleware, noteHandler.GetAllNotes)
		notes.GET("/export", authMiddleware, noteHandler.ExportAllNotes)
		notes.POST("/export", authMiddleware, noteHandler.ExportNotesByIds)
		notes.POST("/import", authMiddleware, noteHandler.ImportNotes)

		// Only note
		notes.GET("/:id", authMiddleware, noteHandler.GetNoteById)
		notes.GET("/:id/export", authMiddleware, noteHandler.ExportNoteById)
		notes.PATCH("/:id", authMiddleware, noteHandler.UpdateNote)
		notes.DELETE("/:id", authMiddleware, noteHandler.DeleteNote)

		notes.GET("/:id/ws", authMiddleware,func(ctx *gin.Context) {
			noteHandler.WsNoteById(ctx, hub)
		})
	}

	tabs := notes.Group("/tabs")
	{
		tabs.PATCH("/:id")
	}

}

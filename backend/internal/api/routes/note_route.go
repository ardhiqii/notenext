package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/api/handlers/websocket"
	"github.com/gin-gonic/gin"
)

func RegisterNoteRoutes(route *gin.RouterGroup, authMiddleware gin.HandlerFunc, noteHandler *handlers.NoteHandler, hub *websocket.Hub) {
	publicNotes := route.Group("/notes")
	{
		publicNotes.POST("", noteHandler.CreateNote)
		publicNotes.GET("", noteHandler.GetAllNotes)
		publicNotes.GET("/export", noteHandler.ExportAllNotes)
		publicNotes.POST("/export", noteHandler.ExportNotesByIds)
		publicNotes.POST("/import", noteHandler.ImportNotes)

		// Only note
		publicNotes.GET("/:id", noteHandler.GetNoteById)
		publicNotes.GET("/:id/export", noteHandler.ExportNoteById)
		publicNotes.PATCH("/:id", noteHandler.UpdateNote)
		publicNotes.DELETE("/:id", noteHandler.DeleteNote)

		publicNotes.GET("/:id/ws", func(ctx *gin.Context) {
			noteHandler.WsNoteById(ctx, hub)
		})
	}

	publicTabs := publicNotes.Group("/tabs")
	{
		publicTabs.PATCH("/:id")
	}

	me := route.Group("/me", authMiddleware)
	privateNote := me.Group("/notes")
	{
		privateNote.POST("", noteHandler.CreateNote)
		privateNote.GET("", noteHandler.GetAllNotes)
		privateNote.GET("/export", noteHandler.ExportAllNotes)
		privateNote.POST("/export", noteHandler.ExportNotesByIds)
		privateNote.POST("/import", noteHandler.ImportNotes)

		// Only note
		privateNote.GET("/:id", noteHandler.GetNoteById)
		privateNote.GET("/:id/export", noteHandler.ExportNoteById)
		privateNote.PATCH("/:id", noteHandler.UpdateNote)
		privateNote.DELETE("/:id", noteHandler.DeleteNote)

		privateNote.GET("/:id/ws", func(ctx *gin.Context) {
			noteHandler.WsNoteById(ctx, hub)
		})
	}

	privateTabs := privateNote.Group("/tabs")
	{
		privateTabs.PATCH("/:id")
	}

}

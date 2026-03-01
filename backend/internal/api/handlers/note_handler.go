package handlers

import (
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/api/handlers/websocket"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type NoteHandler struct {
	noteService *services.NoteService
}

func NewNoteHandler(noteService *services.NoteService) *NoteHandler {
	return &NoteHandler{noteService}
}

func (n *NoteHandler) GetAllNotes(ctx *gin.Context) {
	if ctx.Query("only_tabs") == "true" {
		resp, err := n.noteService.GetAllOnlyTabs(ctx)
		if err != nil {
			api.InternalServerError(ctx, "Failed to get all tabs")
			log.Error().Err(err).Msg("Error get all tabs")
		}
		api.JsonResponse(ctx, http.StatusOK, resp)
		return
	}

	resp, err := n.noteService.GetAllNotes(ctx)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get all notes")
		log.Error().Err(err).Msg("Error get all notes")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) GetNoteById(ctx *gin.Context) {
	var req dtos.GetNoteRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Failed to get a note")
		log.Error().Err(err).Msg("Error binding id")
		return
	}

	resp, err := n.noteService.GetNoteById(ctx, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get a note")
		log.Error().Err(err).Msg("Error get a note")
		return
	}
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) CreateNote(ctx *gin.Context) {
	resp, err := n.noteService.CreateNote(ctx)
	if err != nil {
		api.InternalServerError(ctx, "Failed to create note")
		log.Error().Err(err).Msg("Error creating note")
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"data": resp, "message": "Note created successfully"})
}

func (n *NoteHandler) UpdateNote(ctx *gin.Context) {
	var req dtos.UpdateNoteRequest

	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error in binding note id")
		return
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Failed to update note")
		log.Error().Err(err).Msg("Error binding json")
		return
	}

	if req.Title == nil && req.Content == nil {
		api.BadRequestResponse(ctx, "Failed to update note")
		log.Error().Msg("Empty object json")
		return
	}

	if err := n.noteService.UpdateNote(ctx, &req); err != nil {
		api.InternalServerError(ctx, "Failed to update note")
		log.Error().Err(err).Msg("Error update note")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

func (n *NoteHandler) DeleteNote(ctx *gin.Context) {
	var req dtos.DeleteNoteRequest

	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error in binding note id")
		return
	}

	if err := n.noteService.DeleteNote(ctx, &req); err != nil {
		api.InternalServerError(ctx, "Failed to delete note")
		log.Error().Err(err).Msg("Error in DeleteNote")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusNoContent)

}

func (n *NoteHandler) GetAllTabs(ctx *gin.Context) {
	resp, err := n.noteService.GetAllOnlyTabs(ctx)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get all tabs")
		log.Error().Err(err).Msg("Error in get all tabs")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) UpdateTabPosition(ctx *gin.Context) {
	var req dtos.UpdateTabPositionRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error binding note id")
		return
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid tab's position")
		log.Error().Err(err).Msg("ERror binding position_at")
		return
	}

}

func (n *NoteHandler) WsNoteById(ctx *gin.Context, hub *websocket.Hub) {
	noteId := ctx.Param("id")
	if noteId == "" {
		api.BadRequestResponse(ctx, "Invalid note id")
		return
	}
	websocket.ServeWs(ctx.Writer, ctx.Request, hub, noteId)
}

func (n *NoteHandler) ExportNoteById(ctx *gin.Context) {
	var req dtos.GetNoteRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error binding note id")
		return
	}

	resp, err := n.noteService.ExportNoteById(ctx, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export note")
		log.Error().Err(err).Msg("Error exporting note")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=note-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) ExportAllNotes(ctx *gin.Context) {
	resp, err := n.noteService.ExportAllNotes(ctx)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export notes")
		log.Error().Err(err).Msg("Error exporting notes")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=notes-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) ExportNotesByIds(ctx *gin.Context) {
	var req dtos.ExportNotesRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid export data")
		log.Error().Err(err).Msg("Error binding export request")
		return
	}

	resp, err := n.noteService.ExportNotesByIds(ctx, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export notes")
		log.Error().Err(err).Msg("Error exporting notes")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=notes-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (n *NoteHandler) ImportNotes(ctx *gin.Context) {
	var req dtos.ImportNotesRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid import data")
		log.Error().Err(err).Msg("Error binding import request")
		return
	}

	resp, err := n.noteService.ImportNotes(ctx, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to import notes")
		log.Error().Err(err).Msg("Error importing notes")
		return
	}

	api.JsonResponse(ctx, http.StatusCreated, resp)
}

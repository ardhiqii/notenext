package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/api/handlers/websocket"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type NoteHandler struct {
	noteService *services.NoteService
	authService *services.AuthService
}

func NewNoteHandler(noteService *services.NoteService, authService *services.AuthService) *NoteHandler {
	return &NoteHandler{noteService, authService}
}

func (h *NoteHandler) GetAllNotes(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if ctx.Query("only_tabs") == "true" {
		resp, err := h.noteService.GetAllOnlyTabs(ctx.Request.Context(), userID)
		if err != nil {
			api.InternalServerError(ctx, "Failed to get all tabs")
			log.Error().Err(err).Msg("Error get all tabs")
			return
		}
		api.JsonResponse(ctx, http.StatusOK, resp)
		return
	}

	resp, err := h.noteService.GetAllNotes(ctx.Request.Context(), userID)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get all notes")
		log.Error().Err(err).Msg("Error get all notes")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

// SearchNotes handles GET /notes/search?q=... — optional auth (guests search
// global notes). Empty/missing q returns an empty array instead of erroring.
func (h *NoteHandler) SearchNotes(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	q := strings.TrimSpace(ctx.Query("q"))
	if q == "" {
		api.JsonResponse(ctx, http.StatusOK, []*dtos.SearchNoteResponse{})
		return
	}

	resp, err := h.noteService.SearchNotes(ctx.Request.Context(), userID, q)
	if err != nil {
		api.InternalServerError(ctx, "Failed to search notes")
		log.Error().Err(err).Msg("Error searching notes")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

// GetPublicNotes returns the global/public seeded notes — accessible to
// everyone, including logged-in users (no auth needed).
func (h *NoteHandler) GetPublicNotes(ctx *gin.Context) {
	resp, err := h.noteService.GetPublicNotes(ctx.Request.Context())
	if err != nil {
		api.InternalServerError(ctx, "Failed to get public notes")
		log.Error().Err(err).Msg("Error get public notes")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) GetNoteById(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req dtos.GetNoteRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Failed to get a note")
		log.Error().Err(err).Msg("Error binding id")
		return
	}

	resp, err := h.noteService.GetNoteById(ctx.Request.Context(), userID, &req)
	if errors.Is(err, repositories.RepoErrors.NotFound) {
		api.NotFoundResponse(ctx, "note is not found")
		log.Error().Err(err).Msg("Error note is not found")
		return
	}
	if err != nil {
		api.InternalServerError(ctx, "Failed to get a note")
		log.Error().Err(err).Msg("Error get a note")
		return
	}
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) CreateNote(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req dtos.CreateNoteRequest
	_ = ctx.ShouldBindJSON(&req) // body is optional — ignore bind error, groupID stays nil
	resp, err := h.noteService.CreateNote(ctx.Request.Context(), userID, req.GroupID)

	if errors.Is(err, repositories.RepoErrors.LimitReached) {
		api.ForbiddenResponse(ctx, "public notes limit reached")
		log.Error().Err(err).Msg("public notes limit reached")
		return
	}

	if errors.Is(err, repositories.RepoErrors.NotFound) {
		api.NotFoundResponse(ctx, "group is not found")
		log.Error().Err(err).Msg("group is not found")
		return
	}

	if err != nil {
		api.InternalServerError(ctx, "Failed to create note")
		log.Error().Err(err).Msg("Error creating note")
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"data": resp, "message": "Note created successfully"})
}

func (h *NoteHandler) UpdateNote(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
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

	if err := h.noteService.UpdateNote(ctx.Request.Context(), userID, &req); err != nil {
		if errors.Is(err, repositories.RepoErrors.Forbidden) {
			api.ForbiddenResponse(ctx, "forbidden")
			log.Error().Err(err).Msg("Error update note: forbidden")
			return
		}
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "note is not found")
			log.Error().Err(err).Msg("Error update note: not found")
			return
		}
		api.InternalServerError(ctx, "Failed to update note")
		log.Error().Err(err).Msg("Error update note")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

func (h *NoteHandler) DeleteNote(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)

	var req dtos.DeleteNoteRequest

	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error in binding note id")
		return
	}
	if err := h.noteService.DeleteNote(ctx.Request.Context(), userID, &req); err != nil {
		if errors.Is(err, repositories.RepoErrors.Forbidden) {
			api.ForbiddenResponse(ctx, "forbidden")
			log.Error().Err(err).Msg("Error in DeleteNote: forbidden")
			return
		}
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "note is not found")
			log.Error().Err(err).Msg("Error in DeleteNote: not found")
			return
		}
		api.InternalServerError(ctx, "Failed to delete note")
		log.Error().Err(err).Msg("Error in DeleteNote")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusNoContent)

}

func (h *NoteHandler) GetAllTabs(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	resp, err := h.noteService.GetAllOnlyTabs(ctx.Request.Context(), userID)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get all tabs")
		log.Error().Err(err).Msg("Error in get all tabs")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) UpdateTabPosition(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	// The /notes/tabs/:id endpoint requires authentication: without a token
	// OptionalAuth leaves userID empty, and guests must not reposition notes.
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error updating tab position: unauthenticated")
		return
	}

	var req dtos.UpdateTabPositionRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error binding note id")
		return
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid tab's position")
		log.Error().Err(err).Msg("Error binding position_at")
		return
	}

	if req.PositionAt < 0 {
		api.BadRequestResponse(ctx, "Invalid tab's position")
		log.Error().Msg("Error validating position_at")
		return
	}

	if err := h.noteService.UpdateTabPosition(ctx.Request.Context(), userID, &req); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "note is not found")
			log.Error().Err(err).Msg("Error updating tab position: not found")
			return
		}
		api.InternalServerError(ctx, "Failed to update tab position")
		log.Error().Err(err).Msg("Error updating tab position")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

func (h *NoteHandler) WsNoteById(ctx *gin.Context, hub *websocket.Hub) {
	token := ctx.Query("ticket")
	if token == "" {
		api.ForbiddenResponse(ctx, "ticket is expired or not exist")
		log.Error().Msg("ticket doesnt exists")
		return
	}

	userID := ""
	claims, err := h.authService.ValidateToken(token)
	if err != nil {
		api.UnauthorizedResponse(ctx, "invalid or expired ticket")
		return
	}
	// Only a purpose-built WS ticket may open a WS connection. Access tokens
	// and Google OAuth state tokens also validate as JWTs — without this
	// check a leaked access token could be replayed as a WS ticket.
	if claims.TokenType != services.TokenTypeWS {
		api.UnauthorizedResponse(ctx, "invalid ticket type")
		return
	}
	userID = claims.Subject

	noteId := ctx.Param("id")
	if noteId == "" {
		api.BadRequestResponse(ctx, "Invalid note id")
		return
	}

	_, err = h.noteService.GetNoteById(ctx.Request.Context(), userID, &dtos.GetNoteRequest{
		ID: noteId,
	})

	if errors.Is(err, repositories.RepoErrors.NotFound) {
		api.NotFoundResponse(ctx, "note is not found")
		log.Error().Err(err).Msg("error note is not found")
		return
	}

	if err != nil {
		api.InternalServerError(ctx, "failed to connect")
		log.Error().Err(err).Msg("failed to connect")
		return
	}

	websocket.ServeWs(ctx.Writer, ctx.Request, hub, noteId, userID)
}

func (h *NoteHandler) ExportNoteById(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req dtos.GetNoteRequest
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid note id")
		log.Error().Err(err).Msg("Error binding note id")
		return
	}

	resp, err := h.noteService.ExportNoteById(ctx.Request.Context(), userID, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export note")
		log.Error().Err(err).Msg("Error exporting note")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=note-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) ExportAllNotes(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	resp, err := h.noteService.ExportAllNotes(ctx.Request.Context(), userID)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export notes")
		log.Error().Err(err).Msg("Error exporting notes")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=notes-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) ExportNotesByIds(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req dtos.ExportNotesRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid export data")
		log.Error().Err(err).Msg("Error binding export request")
		return
	}

	resp, err := h.noteService.ExportNotesByIds(ctx.Request.Context(), userID, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to export notes")
		log.Error().Err(err).Msg("Error exporting notes")
		return
	}

	ctx.Header("Content-Disposition", "attachment; filename=notes-export.json")
	api.JsonResponse(ctx, http.StatusOK, resp)
}

func (h *NoteHandler) ImportNotes(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	var req dtos.ImportNotesRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid import data")
		log.Error().Err(err).Msg("Error binding import request")
		return
	}

	resp, err := h.noteService.ImportNotes(ctx.Request.Context(), userID, &req)
	if err != nil {
		if errors.Is(err, repositories.RepoErrors.LimitReached) {
			api.ForbiddenResponse(ctx, "public notes limit reached")
			log.Error().Err(err).Msg("Error importing notes: limit reached")
			return
		}
		api.InternalServerError(ctx, "Failed to import notes")
		log.Error().Err(err).Msg("Error importing notes")
		return
	}

	api.JsonResponse(ctx, http.StatusCreated, resp)
}

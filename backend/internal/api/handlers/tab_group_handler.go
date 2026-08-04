package handlers

import (
	"errors"
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api"
	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type TabGroupHandler struct {
	groupService *services.TabGroupService
	noteService  *services.NoteService
}

func NewTabGroupHandler(groupService *services.TabGroupService, noteService *services.NoteService) *TabGroupHandler {
	return &TabGroupHandler{groupService: groupService, noteService: noteService}
}

// POST /groups
func (h *TabGroupHandler) Create(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	// Tab groups are a per-user workspace feature — guests have no owned
	// groups, so creating one would orphan a row with user_id NULL that can
	// never be deleted (delete is ownership-scoped). Reject unauthenticated.
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error creating tab group: unauthenticated")
		return
	}

	var req dtos.CreateTabGroupRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid group data")
		log.Error().Err(err).Msg("Error binding create tab group request")
		return
	}

	resp, err := h.groupService.Create(ctx.Request.Context(), userID, &req)
	if err != nil {
		api.InternalServerError(ctx, "Failed to create tab group")
		log.Error().Err(err).Msg("Error creating tab group")
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{"data": resp, "message": "Tab group created successfully"})
}

// GET /groups
func (h *TabGroupHandler) GetAllWithTabs(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)

	resp, err := h.groupService.GetAllWithTabs(ctx.Request.Context(), userID)
	if err != nil {
		api.InternalServerError(ctx, "Failed to get tab groups")
		log.Error().Err(err).Msg("Error getting tab groups")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, resp)
}

// GET /groups/:id
func (h *TabGroupHandler) GetByID(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)

	var req dtos.TabGroupIDParam
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid group id")
		log.Error().Err(err).Msg("Error binding group id")
		return
	}

	group, err := h.groupService.GetByID(ctx.Request.Context(), userID, req.ID)
	if errors.Is(err, repositories.RepoErrors.NotFound) {
		api.NotFoundResponse(ctx, "Tab group not found")
		log.Error().Err(err).Msg("Tab group not found")
		return
	}
	if err != nil {
		api.InternalServerError(ctx, "Failed to get tab group")
		log.Error().Err(err).Msg("Error getting tab group")
		return
	}

	api.JsonResponse(ctx, http.StatusOK, dtos.TabGroupResponse{
		ID:         group.ID,
		Name:       group.Name,
		PositionAt: group.PositionAt,
		Collapsed:  group.Collapsed,
		CreatedAt:  group.CreatedAt,
		UpdatedAt:  group.UpdatedAt,
	})
}

// PATCH /groups/:id
func (h *TabGroupHandler) Rename(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error renaming tab group: unauthenticated")
		return
	}

	var uri dtos.TabGroupIDParam
	if err := ctx.ShouldBindUri(&uri); err != nil {
		api.BadRequestResponse(ctx, "Invalid group id")
		log.Error().Err(err).Msg("Error binding group id")
		return
	}

	var req dtos.RenameTabGroupRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid rename data")
		log.Error().Err(err).Msg("Error binding rename request")
		return
	}

	if err := h.groupService.Rename(ctx.Request.Context(), userID, uri.ID, req.Name); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab group not found")
			return
		}
		api.InternalServerError(ctx, "Failed to rename tab group")
		log.Error().Err(err).Msg("Error renaming tab group")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// DELETE /groups/:id
func (h *TabGroupHandler) Delete(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error deleting tab group: unauthenticated")
		return
	}

	var req dtos.TabGroupIDParam
	if err := ctx.ShouldBindUri(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid group id")
		log.Error().Err(err).Msg("Error binding group id")
		return
	}

	if err := h.groupService.Delete(ctx.Request.Context(), userID, req.ID); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab group not found")
			return
		}
		api.InternalServerError(ctx, "Failed to delete tab group")
		log.Error().Err(err).Msg("Error deleting tab group")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusNoContent)
}

// PATCH /groups/reorder
func (h *TabGroupHandler) Reorder(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error reordering tab groups: unauthenticated")
		return
	}

	var req dtos.ReorderGroupsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid reorder data")
		log.Error().Err(err).Msg("Error binding reorder request")
		return
	}

	if err := h.groupService.Reorder(ctx.Request.Context(), userID, req.GroupIDs); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab group not found")
			return
		}
		api.InternalServerError(ctx, "Failed to reorder tab groups")
		log.Error().Err(err).Msg("Error reordering tab groups")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// PATCH /groups/:id/collapse
func (h *TabGroupHandler) ToggleCollapse(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error toggling collapse: unauthenticated")
		return
	}

	var uri dtos.TabGroupIDParam
	if err := ctx.ShouldBindUri(&uri); err != nil {
		api.BadRequestResponse(ctx, "Invalid group id")
		log.Error().Err(err).Msg("Error binding group id")
		return
	}

	var req dtos.ToggleCollapseRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid collapse data")
		log.Error().Err(err).Msg("Error binding collapse request")
		return
	}

	if err := h.groupService.ToggleCollapse(ctx.Request.Context(), userID, uri.ID, req.Collapsed); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab group not found")
			return
		}
		api.InternalServerError(ctx, "Failed to toggle collapse")
		log.Error().Err(err).Msg("Error toggling collapse")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// PATCH /tabs/:tabId/group
func (h *TabGroupHandler) AssignGroup(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error assigning tab to group: unauthenticated")
		return
	}

	var uri dtos.TabGroupAssignParam
	if err := ctx.ShouldBindUri(&uri); err != nil {
		api.BadRequestResponse(ctx, "Invalid tab id")
		log.Error().Err(err).Msg("Error binding tab id")
		return
	}

	var req dtos.AssignGroupRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid group assignment data")
		log.Error().Err(err).Msg("Error binding assign group request")
		return
	}

	if err := h.noteService.AssignNoteToGroup(ctx.Request.Context(), userID, uri.TabID, req.GroupID); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab not found")
			return
		}
		api.InternalServerError(ctx, "Failed to assign tab to group")
		log.Error().Err(err).Msg("Error assigning tab to group")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

// PATCH /groups/:id/tabs/reorder
func (h *TabGroupHandler) ReorderTabsInGroup(ctx *gin.Context) {
	userID := ctx.GetString(constants.ContextKeys.UserID)
	if userID == "" {
		api.UnauthorizedResponse(ctx, "authentication required")
		log.Error().Msg("Error reordering tabs in group: unauthenticated")
		return
	}

	var uri dtos.TabGroupIDParam
	if err := ctx.ShouldBindUri(&uri); err != nil {
		api.BadRequestResponse(ctx, "Invalid group id")
		log.Error().Err(err).Msg("Error binding group id for reorder")
		return
	}

	var req dtos.ReorderTabsInGroupRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		api.BadRequestResponse(ctx, "Invalid reorder data")
		log.Error().Err(err).Msg("Error binding reorder tabs request")
		return
	}

	if err := h.noteService.ReorderTabsInGroup(ctx.Request.Context(), userID, uri.ID, req.TabIDs); err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			api.NotFoundResponse(ctx, "Tab or group not found")
			return
		}
		api.InternalServerError(ctx, "Failed to reorder tabs in group")
		log.Error().Err(err).Msg("Error reordering tabs in group")
		return
	}

	api.StatusCodeResponse(ctx, http.StatusOK)
}

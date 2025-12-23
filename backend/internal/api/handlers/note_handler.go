package handlers

import (
	"net/http"

	"github.com/ardhiqii/notenext/backend/internal/api"
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

func (n *NoteHandler) CreateNote(ctx *gin.Context) {
	resp, err := n.noteService.CreateNote(ctx)
	if err != nil {	
		api.InternalServerError(ctx,"Failed to create note")
		log.Error().Err(err).Msg("Error creating note")
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"data":resp, "message":"Note created successfully"})
}


func (n *NoteHandler) GetAllNotes(ctx *gin.Context) {
	resp, err := n.noteService.GetAllNotes(ctx)
	if err != nil {
		api.InternalServerError(ctx,"Failed to get all notes")
		log.Error().Err(err).Msg("Error get all notes")
		return
	}

	api.JsonResponse(ctx,http.StatusOK,resp)
}


func (n *NoteHandler) UpdateContentNote(ctx *gin.Context){
	noteId := ctx.Param("id")
	noteReq := dtos.UpdateContentNoteRequest{
		ID: noteId,
	}
	
	if err := ctx.ShouldBindJSON(&noteReq); err != nil {
		api.BadRequestResponse(ctx,"Failed to update content")
		log.Error().Err(err).Msg("Error binding request")
		return
	}

	n.noteService.UpdateNoteContent(ctx,&noteReq)
	
	api.JsonResponse(ctx,http.StatusAccepted,"successfully")
}
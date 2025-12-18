package handlers

import (
	"net/http"

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
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create note"})
		log.Error().Err(err).Msg("Error creating note")
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"data":resp, "message":"Note created successfully"})
}

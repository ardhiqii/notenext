package handlers

import (
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type NoteHandler struct {
	noteService *services.NoteService
}

func NewNoteHandler(noteService *services.NoteService) *NoteHandler {
	return &NoteHandler{noteService}
}

func (n *NoteHandler) CreateNote(ctx *gin.Context) {

}

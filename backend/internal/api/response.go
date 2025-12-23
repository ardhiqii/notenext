package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type apiErrorResponse struct {
	Error *apiError `json:"error"`
}

type apiError struct {
	Message string `json:"message"`
}

type apiResponse struct {
	Data any `json:"data"`
}

func InternalServerError(ctx *gin.Context, message string) {
	ctx.JSON(http.StatusInternalServerError, apiErrorResponse{
		Error: &apiError{
			Message: message,
		},
	})
}

func BadRequestResponse(ctx *gin.Context, message string) {
	ctx.JSON(http.StatusBadRequest, apiErrorResponse{
		Error: &apiError{
			Message: message,
		},
	})
}

func JsonResponse(ctx *gin.Context, code int, data any) {
	ctx.JSON(code, apiResponse{
		Data: data,
	})
}

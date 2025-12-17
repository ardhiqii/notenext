package app

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/api/routes"
	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

type application struct {
	config *configs.Config
	logger zerolog.Logger
	router *gin.Engine
}

func NewApplication(config *configs.Config, router *gin.Engine, logger zerolog.Logger) *application {
	return &application{
		config: config,
		router: router,
		logger: logger,
	}
}

func (app *application) Run() {
	server := &http.Server{
		Addr:    app.config.Server.Address,
		Handler: app.router.Handler(),
	}
	// Graceful shutdown
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, syscall.SIGINT, syscall.SIGTERM)
	app.logger.Info().Msgf("Starting server on %s", app.config.Server.Address)

	// Run server in a goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			app.logger.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for termination signal
	<-signalChan
	app.logger.Info().Msg("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		app.logger.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	app.logger.Info().Msg("Server exited gracefully")

}

func (app *application) RegisterRoutes(db *sql.DB) {
	noteRepository := repositories.NewNoteRepository(db)
	noteService := services.NewNoteService(noteRepository)
	noteHandler := handlers.NewNoteHandler(noteService)

	v1 := app.router.Group("/api/v1")
	routes.RegisterNoteRoutes(v1, noteHandler)
}

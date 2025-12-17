package main

import (
	"time"

	"github.com/ardhiqii/notenext/backend/internal/app"
	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	config := configs.NewConfig()

	db,err := database.NewDatabaseClient(database.Config{
		Driver: config.Database.Driver,
		Source: config.Database.Source,
		ConnectionTimeOut: 5 * time.Second,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")	
	}


	router := gin.Default()
	
	cors := configs.NewCors()
	router.Use(cors)

	app := app.NewApplication(config,router,log.Logger)
	app.RegisterRoutes(db)
	app.Run()
	
}
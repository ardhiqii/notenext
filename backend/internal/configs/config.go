package configs

import (
	"fmt"
	"os"

	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

type Config struct {
	Server   serverConfig
	Database databaseConfig
	OauthConfig oauthConfig
}

type serverConfig struct {
	Address string
}
type databaseConfig struct {
	Driver string
	Source string
}

type oauthConfig struct {
	Google oauthGoogle
}

type oauthGoogle struct {
	ClientID string
	ClientSecret string
	RedirectURL string
}

func NewConfig() *Config {
	if err := godotenv.Load(".env"); err != nil {
		fmt.Println("Failed to load .env file")
	}

	return &Config{
		Server: serverConfig{
			Address: GetEnvOrPanic(constants.EnvKeys.ServerAddress),
		},
		Database: databaseConfig{
			Driver: GetEnvOrPanic(constants.EnvKeys.DBDriver),
			Source: GetEnvOrPanic(constants.EnvKeys.DBSource),
		},
		OauthConfig: oauthConfig{
			Google: oauthGoogle{
				ClientID: GetEnvOrPanic(constants.EnvKeys.GoogleClientID),
				ClientSecret: GetEnvOrPanic(constants.EnvKeys.GoogleClientSecret),
				RedirectURL: "",
			},
		},
	}
}

func NewCors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization"},
	})
}

func GetEnvOrPanic(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic(fmt.Sprintf("Environment variable %s not set", key))
	}
	return value
}

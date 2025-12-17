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
}

type serverConfig struct {
	Address string
}
type databaseConfig struct {
	Driver string
	Source string
}

func NewConfig() *Config {
	if err := godotenv.Load(".env"); err != nil {
		panic("Failed to load .env file")
	}

	return &Config{
		Server: serverConfig{
			Address: GetEnvOrPanic(constants.EnvKeys.ServerAddress),
		},
		Database: databaseConfig{
			Driver: GetEnvOrPanic(constants.EnvKeys.DBDriver),
			Source: GetEnvOrPanic(constants.EnvKeys.DBSource),
		},
	}
}

func NewCors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type"},
	})
}

func GetEnvOrPanic(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic(fmt.Sprintf("Environment variable %s not set", key))
	}
	return value
}

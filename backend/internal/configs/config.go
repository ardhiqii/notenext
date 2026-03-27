package configs

import (
	"fmt"
	"os"

	"github.com/ardhiqii/notenext/backend/internal/constants"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"golang.org/x/oauth2"
)

type Config struct {
	Server      serverConfig
	Database    databaseConfig
	FrontendURL string
	OAuthConfig OAuthConfig
}

type serverConfig struct {
	Address string
}
type databaseConfig struct {
	Driver string
	Source string
}

type OAuthConfig struct {
	Google    *oauth2.Config
	JWTSecret string
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
		FrontendURL: GetEnvOrPanic("FRONTEND_URL"),
		OAuthConfig: OAuthConfig{
			Google: &oauth2.Config{
				ClientID:     GetEnvOrPanic(constants.EnvKeys.GoogleClientID),
				ClientSecret: GetEnvOrPanic(constants.EnvKeys.GoogleClientSecret),
				RedirectURL:  GetEnvOrPanic(constants.EnvKeys.GoogleRedirectURL),
				Scopes: []string{
					"https://www.googleapis.com/auth/userinfo.email",
					"https://www.googleapis.com/auth/userinfo.profile",
					"openid",
				},
				Endpoint: oauth2.Endpoint{
					AuthURL:       "https://accounts.google.com/o/oauth2/v2/auth",
					TokenURL:      "https://oauth2.googleapis.com/token",
					DeviceAuthURL: "https://oauth2.googleapis.com/device/code",

					AuthStyle: oauth2.AuthStyleInParams,
				},
			},
			JWTSecret: GetEnvOrPanic("JWT_SECRET"),
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

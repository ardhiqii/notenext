package constants

type envKeys struct {
	ServerAddress string
	DBDriver string
	DBSource string
	FrontendURL string

	GoogleClientID string
	GoogleClientSecret string
	GoogleRedirectURL string
}

var EnvKeys = envKeys{
	ServerAddress: "SERVER_PORT",
	DBDriver: "DB_DRIVER",
	DBSource: "DB_SOURCE",
	FrontendURL: "FRONTEND_URL",

	GoogleClientID: "GOOGLE_CLIENT_ID",
	GoogleClientSecret: "GOOGLE_CLIENT_SECRET",
	GoogleRedirectURL: "GOOGLE_REDIRECT_URL",
}


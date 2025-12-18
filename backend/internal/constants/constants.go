package constants

type envKeys struct {
	ServerAddress string
	DBDriver string
	DBSource string
}

var EnvKeys = envKeys{
	ServerAddress: "SERVER_PORT",
	DBDriver: "DB_DRIVER",
	DBSource: "DB_SOURCE",
}


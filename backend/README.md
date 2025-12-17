# NoteNext Backend

A clean architecture REST API built with Go and Gin framework for managing notes.

## 🏗️ Architecture

This project follows **Clean Architecture** principles with clear separation of concerns:

```
├── cmd/                    # Application entry points
│   └── server/            # Main server application
├── config/                # Configuration management
├── internal/              # Private application code
│   ├── api/              # API layer
│   │   ├── handler/      # HTTP handlers/controllers
│   │   └── route/        # Route definitions
│   ├── database/         # Database configuration
│   ├── middleware/       # Custom middleware
│   ├── model/           # Domain models & DTOs
│   ├── repository/      # Data access layer
│   └── service/         # Business logic layer
└── pkg/                  # Public libraries
    ├── response/        # Standardized API responses
    └── utils/          # Utility functions
```

## 🚀 Features

- ✅ Clean Architecture with layered design
- ✅ RESTful API with Gin framework
- ✅ SQLite database with migration support
- ✅ Structured logging with zerolog
- ✅ CORS support
- ✅ Standardized API responses
- ✅ Error handling and recovery
- ✅ Environment-based configuration

## 📋 Prerequisites

- Go 1.24.2 or higher
- Git

## 🛠️ Installation

1. Clone the repository

```bash
git clone <your-repo>
cd backend
```

2. Install dependencies

```bash
go mod download
```

3. Create environment file

```bash
cp .env.example .env
```

4. Run the application

```bash
go run cmd/server/main.go
```

## 🔧 Configuration

Edit `.env` file to configure the application:

```env
SERVER_PORT=8080
GIN_MODE=debug          # debug, release, or test
DB_DRIVER=sqlite
DB_DSN=./notenext.db
```

## 📡 API Endpoints

### Health Check

```
GET /health
```

### Notes API

| Method | Endpoint            | Description       |
| ------ | ------------------- | ----------------- |
| POST   | `/api/v1/notes`     | Create a new note |
| GET    | `/api/v1/notes`     | Get all notes     |
| GET    | `/api/v1/notes/:id` | Get note by ID    |
| PUT    | `/api/v1/notes/:id` | Update note       |
| DELETE | `/api/v1/notes/:id` | Delete note       |

### Example Requests

**Create Note:**

```bash
curl -X POST http://localhost:8080/api/v1/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"My Note","content":"Note content here"}'
```

**Get All Notes:**

```bash
curl http://localhost:8080/api/v1/notes
```

**Get Note by ID:**

```bash
curl http://localhost:8080/api/v1/notes/1
```

**Update Note:**

```bash
curl -X PUT http://localhost:8080/api/v1/notes/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","content":"Updated content"}'
```

**Delete Note:**

```bash
curl -X DELETE http://localhost:8080/api/v1/notes/1
```

## 🏃 Development

### Run with Air (Hot Reload)

```bash
air
```

### Build

```bash
go build -o bin/server cmd/server/main.go
```

### Run Tests

```bash
go test ./...
```

## 📦 Project Structure Explained

### Layers

1. **Handler Layer** (`internal/api/handler`)

   - Handles HTTP requests and responses
   - Validates input
   - Calls service layer

2. **Service Layer** (`internal/service`)

   - Contains business logic
   - Orchestrates operations
   - Calls repository layer

3. **Repository Layer** (`internal/repository`)

   - Data access abstraction
   - Database operations
   - No business logic

4. **Model Layer** (`internal/model`)
   - Domain entities
   - Request/Response DTOs
   - Validation rules

### Dependencies Flow

```
Handler → Service → Repository → Database
```

## 🔒 Best Practices

- ✅ Dependency injection for loose coupling
- ✅ Interface-based design for testability
- ✅ Error wrapping for better debugging
- ✅ Structured logging
- ✅ Standardized API responses
- ✅ Input validation
- ✅ Graceful error handling

## 📝 Adding New Features

1. **Add Model** in `internal/model/`
2. **Create Repository Interface** in `internal/repository/`
3. **Implement Service** in `internal/service/`
4. **Create Handler** in `internal/api/handler/`
5. **Register Routes** in `internal/api/route/`
6. **Wire Dependencies** in `cmd/server/main.go`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

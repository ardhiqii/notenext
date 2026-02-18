# NoteNext - Agent Instructions

A note-taking application with a React/TypeScript frontend and Go backend.

## Project Structure

```
notenext/
├── frontend/          # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── ui/        # shadcn/ui components
│   │   │   └── modals/    # Modal components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities (api, utils, etc.)
│   │   ├── providers/     # React context providers
│   │   ├── queries/       # TanStack Query keys
│   │   ├── types/         # TypeScript type definitions
│   │   └── constants/     # Application constants
│   └── ...
├── backend/           # Go + Gin + SQLite
│   ├── cmd/api/           # Application entry point
│   └── internal/
│       ├── api/           # HTTP layer
│       │   ├── handlers/  # Request handlers
│       │   └── routes/    # Route definitions
│       ├── services/      # Business logic
│       ├── repositories/  # Data access
│       ├── entities/      # Domain models
│       ├── dtos/          # Data transfer objects
│       └── database/      # Database configuration
└── docker-compose.yml
```

## Build Commands

### Frontend (from `frontend/` directory)

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Type check (via build)
npx tsc --noEmit
```

### Backend (from `backend/` directory)

```bash
# Install dependencies
go mod download

# Run development server (with hot reload via Air)
air

# Run without hot reload
go run cmd/api/main.go

# Build binary
go build -o bin/server cmd/api/main.go

# Run all tests
go test ./...

# Run specific test
go test ./internal/services -run TestNoteService

# Run tests with verbose output
go test -v ./...
```

### Docker

```bash
# Build and run all services
docker-compose up --build

# Run in detached mode
docker-compose up -d
```

## Code Style Guidelines

### Frontend (TypeScript/React)

#### Imports

```typescript
// 1. External packages first
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

// 2. Internal aliases (use @ for src)
import { api } from "@/lib/api";
import { queryKeys } from "@/queries";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";

// 3. Relative imports last (avoid when possible)
import { useModal } from "../hooks/use-modal";
```

#### Naming Conventions

- **Components**: PascalCase files and exports (`NoteEditor.tsx`, `TabsBar.tsx`)
- **Hooks**: camelCase with `use` prefix (`useNotes.ts`, `use-modal.ts`)
- **Types**: PascalCase (`type Note = { ... }`, `type Tabs = { ... }`)
- **Functions**: camelCase (`parseNote`, `handleSelectNote`)
- **Constants**: camelCase or SCREAMING_SNAKE_CASE for true constants
- **Query keys**: camelCase object structure (`queryKeys.notes.tabs`)

#### Component Structure

```tsx
// Imports at top
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Types/interfaces before component
type MyComponentProps = {
  title: string;
  onSave: () => void;
};

// Component as default export
const MyComponent = ({ title, onSave }: MyComponentProps) => {
  // 1. Hooks at the top
  const [value, setValue] = useState("");

  // 2. Query/mutation hooks
  const { data } = useQuery({ ... });

  // 3. Event handlers
  const handleClick = () => { ... };

  // 4. JSX return
  return (
    <div>
      ...
    </div>
  );
};

export default MyComponent;
```

#### TanStack Query Patterns

```typescript
// Query key structure in queries/keys.ts
export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["tabs"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
  },
};

// Mutation with optimistic update pattern
const mutation = useMutation<ResponseType, Error, VariablesType, ContextType>({
  mutationFn: async (vars) => { ... },
  onMutate: async (vars, ctx) => {
    await ctx.client.cancelQueries({ queryKey: [...] });
    const previous = ctx.client.getQueryData(...);
    ctx.client.setQueryData(..., optimisticData);
    return { previous };
  },
  onSuccess: (result, vars, context, ctx) => {
    ctx.client.setQueryData(..., result);
  },
  onError: (error, vars, context, ctx) => {
    ctx.client.setQueryData(..., context.previous);
  },
});
```

#### TypeScript Guidelines

- Use `type` for object shapes, `interface` for extendable contracts
- Always type function parameters and return values
- Use `type` keyword for importing types: `import type { Note } from "@/types"`
- Enable strict mode - handle null/undefined explicitly
- Use optional chaining and nullish coalescing: `data?.field ?? "default"`

#### Styling

- Use Tailwind CSS with `cn()` utility for conditional classes
- shadcn/ui components in `components/ui/`
- Add new shadcn components: `make shadcn-add button` or `npx shadcn@latest add button`

### Backend (Go)

#### Naming Conventions

- **Packages**: lowercase, single word (`handlers`, `services`, `repositories`)
- **Types**: PascalCase (`NoteHandler`, `NoteService`, `NoteRepository`)
- **Functions**: PascalCase for exported, camelCase for private
- **Interfaces**: PascalCase with `-er` suffix for single-method (`Reader`, `Writer`)
- **Files**: snake_case (`note_handler.go`, `note_service.go`)

#### Layer Architecture

```
Handler (HTTP) -> Service (Business Logic) -> Repository (Data Access) -> Database
```

#### Handler Pattern

```go
type NoteHandler struct {
    noteService *services.NoteService
}

func NewNoteHandler(noteService *services.NoteService) *NoteHandler {
    return &NoteHandler{noteService}
}

func (n *NoteHandler) GetNoteById(ctx *gin.Context) {
    var req dtos.GetNoteRequest
    if err := ctx.ShouldBindUri(&req); err != nil {
        api.BadRequestResponse(ctx, "Invalid request")
        log.Error().Err(err).Msg("Error binding request")
        return
    }

    resp, err := n.noteService.GetNoteById(ctx, &req)
    if err != nil {
        api.InternalServerError(ctx, "Failed to get note")
        log.Error().Err(err).Msg("Error getting note")
        return
    }
    api.JsonResponse(ctx, http.StatusOK, resp)
}
```

#### Service Pattern

```go
type NoteService struct {
    noteRepo *repositories.NoteRepository
}

func NewNoteService(noteRepo *repositories.NoteRepository) *NoteService {
    return &NoteService{noteRepo}
}

func (n *NoteService) CreateNote(ctx context.Context) (*dtos.CreateNoteResponse, error) {
    // Business logic here
    note := &entities.Note{ ... }
    err := n.noteRepo.Create(ctx, note)
    if err != nil {
        return nil, err
    }
    return dtos.NewCreateNoteResponse(...), nil
}
```

#### Error Handling

- Always check and handle errors
- Use structured logging with zerolog: `log.Error().Err(err).Msg("description")`
- Return appropriate HTTP status codes via response helpers
- Wrap errors with context when appropriate

#### Database Operations

```go
func (n *NoteRepository) Create(ctx context.Context, note *entities.Note) error {
    ctx, cancel := context.WithTimeout(ctx, database.QueryTimeOutDuration)
    defer cancel()

    query := `INSERT INTO notes ...`
    err := n.db.QueryRowContext(ctx, query, args...).Scan(&field)
    if err != nil {
        return err
    }
    return nil
}
```

## API Response Format

Backend uses standardized response helpers in `internal/api/response.go`:

```go
api.JsonResponse(ctx, http.StatusOK, data)      // Success with data
api.StatusCodeResponse(ctx, http.StatusNoContent) // Success without data
api.BadRequestResponse(ctx, "message")           // 400 error
api.InternalServerError(ctx, "message")          // 500 error
```

## Environment Variables

### Frontend (.env)

```
VITE_ROOT_API=http://localhost:8080/api/v1
```

### Backend (.env)

```
SERVER_PORT=8080
GIN_MODE=debug
DB_DRIVER=sqlite
DB_DSN=./internal/data/notenext.db
```

## Notes

- Frontend uses React 19 with TypeScript strict mode
- Backend uses Go 1.24 with Gin framework
- SQLite database for persistence
- WebSocket support for real-time collaboration (y-websocket)
- Use sonner for toast notifications: `toast.success()`, `toast.error()`

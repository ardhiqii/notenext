# NoteNext

A real-time collaborative note-taking application with a Markdown editor. Multiple users can edit the same note simultaneously with conflict-free synchronization powered by Yjs CRDTs over WebSocket.

## Features

- **Collaborative editing** — Multiple users can edit the same note at the same time with real-time cursor presence (powered by Yjs + WebSocket)
- **Markdown editor** — Full CodeMirror 6 editor with Markdown syntax highlighting and a dark theme
- **Tab-based interface** — Each note is a tab; create, close, and rename tabs with double-click inline editing
- **Drag-and-drop tabs** — Reorder tabs with drag-and-drop (dnd-kit)
- **Command palette search** — `Ctrl+K` / `Cmd+K` opens a search modal to find notes by title or content
- **Import / Export** — Export individual or all notes as JSON; import notes from a JSON file
- **Dark / Light theme** — System-aware theme toggle
- **Keyboard shortcuts** — `Mod+Alt+W` to delete the current note
- **Auto-bootstrap** — Automatically creates a first note on fresh install
- **Persistent storage** — Notes stored in SQLite, persisted across restarts

## Tech Stack

### Frontend

| Technology | Role |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite | Build tool |
| TanStack Router | File-based, type-safe routing |
| TanStack Query | Server state management & caching |
| Yjs + y-websocket | CRDT real-time collaboration |
| CodeMirror 6 | Markdown editor engine |
| dnd-kit | Drag-and-drop tab reordering |
| Zustand | Client state (modal management) |
| shadcn/ui + Tailwind CSS | UI components & styling |
| Axios | HTTP client |
| sonner | Toast notifications |

### Backend

| Technology | Role |
|---|---|
| Go 1.24 | Language |
| Gin | HTTP framework |
| gorilla/websocket | WebSocket server |
| modernc.org/sqlite | Pure-Go SQLite driver (no CGO) |
| zerolog | Structured logging |

### Infrastructure

| Technology | Role |
|---|---|
| Docker + Docker Compose | Containerization |
| nginx | Frontend static file serving + SPA routing |

## Project Structure

```
notenext/
├── frontend/               # React + Vite + TypeScript SPA
│   └── src/
│       ├── routes/         # TanStack Router file-based routes
│       ├── components/     # React components (editor, tabs, modals)
│       ├── hooks/          # Custom hooks (useNotes, mutations, queries)
│       ├── providers/      # React context providers
│       ├── queries/        # TanStack Query key registry
│       ├── types/          # TypeScript type definitions
│       ├── lib/            # Axios instance, utils, helpers
│       └── constants/      # App-wide constants
├── backend/                # Go + Gin REST API + WebSocket relay
│   ├── cmd/api/            # Application entry point
│   └── internal/
│       ├── api/            # HTTP handlers & route definitions
│       │   └── handlers/websocket/  # WebSocket hub & client
│       ├── services/       # Business logic
│       ├── repositories/   # SQL data access
│       ├── entities/       # Domain models
│       ├── dtos/           # Request / Response DTOs
│       └── database/       # SQLite initialization
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Go](https://go.dev/) 1.24+
- [Docker](https://www.docker.com/) (optional, for containerized setup)

### Running with Docker (Recommended)

> **Note:** The Docker Compose setup uses an external `proxy_net` Docker network. Create it first if it does not exist:
>
> ```bash
> docker network create proxy_net
> ```

```bash
docker-compose up --build
```

The frontend will be served by nginx and the backend API will be available on port `8080`.

### Running Locally

#### Backend

1. Create the environment file:

```env
# backend/.env
SERVER_PORT=8080
DB_DRIVER=sqlite
DB_SOURCE=./internal/data/notenext.db
```

2. Run the backend:

```bash
# Install dependencies
go mod download

# Run with hot reload (requires Air: go install github.com/air-verse/air@latest)
air

# Or run directly
go run cmd/api/main.go
```

#### Frontend

1. Create the environment file:

```env
# frontend/.env
VITE_ROOT_API=http://localhost:8080/api/v1
```

2. Run the frontend:

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

## API Endpoints

Base URL: `/api/v1`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/notes` | Create a new note |
| `GET` | `/notes` | Get all notes |
| `GET` | `/notes?only_tabs=true` | Get notes (id, title, position only) |
| `GET` | `/notes/:id` | Get a note by ID |
| `PATCH` | `/notes/:id` | Update note title and/or content |
| `DELETE` | `/notes/:id` | Delete a note |
| `GET` | `/notes/export` | Export all notes as JSON |
| `GET` | `/notes/:id/export` | Export a single note as JSON |
| `POST` | `/notes/export` | Export specific notes by IDs |
| `POST` | `/notes/import` | Import notes from JSON |
| `GET` | `/notes/:id/ws` | WebSocket endpoint for real-time collaboration |

### Export / Import Format

```json
{
  "version": "1.0",
  "exportedAt": "2026-01-01T00:00:00Z",
  "notes": [
    {
      "id": "uuid",
      "title": "My Note",
      "content": "# Hello\n\nNote content here.",
      "positionAt": 1
    }
  ]
}
```

## Database Schema

```sql
CREATE TABLE notes (
    id          TEXT     PRIMARY KEY,
    title       TEXT     NOT NULL,
    content     TEXT     NOT NULL,
    position_at INTEGER  NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## How Real-Time Collaboration Works

1. When a user opens a note, the frontend connects to `ws://.../api/v1/notes/<noteId>/ws` and initializes a Yjs `Y.Doc`.
2. The backend `Hub` registers the client in the note's room and broadcasts a `client_join` event to all room members.
3. All Yjs CRDT update messages are binary-relayed to every other client in the room. The backend does not parse Yjs documents — it is a pure relay.
4. Each client's cursor position and color are broadcast via the Yjs awareness protocol.
5. Content is only saved to the database when the user is the **sole occupant** of the room, preventing redundant REST calls during active collaboration sessions.
6. A 300ms debounce is applied to content saves, with a final save on component unmount.

## Development Commands

### Frontend

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check
```

### Backend

```bash
go run cmd/api/main.go   # Run server
go build -o bin/server cmd/api/main.go  # Build binary
go test ./...            # Run all tests
```

### Add a shadcn/ui Component

```bash
# From the frontend/ directory
npx shadcn@latest add <component-name>
```


## License

MIT

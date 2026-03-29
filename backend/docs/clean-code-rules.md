# Clean Code Rules

## 1. Layer Responsibilities

```
Handler     → HTTP in/out. Binds request, calls service, maps entity → DTO, sends JSON.
Service     → Business logic. Works with entities. Calls repository.
Repository  → DB only. Returns entities.
```

**Rules:**

- Repository returns `*entities.X` — never DTOs
- Service returns `*entities.X` — never DTOs
- Handler is the only layer that creates and returns DTOs
- DTOs with `json` tags belong to the handler layer only
- Service/repository should NOT import the `dtos` package

```go
// ✅ correct
func (s *AuthService) GetMe(ctx, userID) (*entities.User, error)

// ❌ wrong — service returns a DTO (HTTP shape)
func (s *AuthService) GetMe(ctx, userID) (*dtos.UserResponse, error)
```

### Full data flow

```
dtos.XRequest → services.XInput → entities.X → entities.X → dtos.XResponse
  (handler)     (handler maps)   (service builds) (service returns) (handler maps)
```

### Passing input into services

- **1 field** → pass a primitive: `GetNoteById(ctx, id string)`
- **2+ fields** → define an input struct in the **service package** (no `json`/`uri` tags needed)

```go
// internal/services/note_service.go
type UpdateNoteInput struct {
    ID      string
    Title   *string
    Content *string
}

func (s *NoteService) UpdateNote(ctx context.Context, input UpdateNoteInput) error
```

Handler maps DTO → service input, never passes the DTO directly:

```go
// ✅ handler maps DTO fields into service input struct
h.noteService.UpdateNote(ctx, services.UpdateNoteInput{
    ID:      req.ID,
    Title:   req.Title,
    Content: req.Content,
})

// ❌ wrong — passes DTO directly into service
h.noteService.UpdateNote(ctx, &req)
```

---

## 2. Error Handling

### Sentinel errors

Define once in the package that owns them:

```go
// internal/repositories/errors.go
var ErrNotFound = errors.New("not found")
```

### Per-layer example

**Repository** — convert DB-specific errors into sentinels here. This is the only place that knows about `sql.ErrNoRows`.

```go
func (r *NoteRepository) GetById(ctx context.Context, id string) (*entities.Note, error) {
    err := row.Scan(&note.ID, &note.Title, ...)
    if err == sql.ErrNoRows {
        return nil, ErrNotFound               // ✅ convert to sentinel, never leak sql errors up
    }
    if err != nil {
        return nil, fmt.Errorf("NoteRepository.GetById: %w", err)  // wrap for context
    }
    return &note, nil
}
```

**Service** — just wrap with context using `%w`. No need to check `ErrNotFound` here unless the service has its own logic that depends on it (rare).

```go
func (s *NoteService) GetNoteById(ctx context.Context, id string) (*entities.Note, error) {
    note, err := s.noteRepo.GetById(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("NoteService.GetNoteById: %w", err)  // %w keeps sentinel detectable
    }
    return note, nil
}
```

**Handler** — the only layer that maps errors to HTTP status codes.

```go
func (h *NoteHandler) GetNoteById(ctx *gin.Context) {
    note, err := h.noteService.GetNoteById(ctx, req.ID)
    if err != nil {
        if errors.Is(err, repositories.ErrNotFound) {
            api.NotFoundResponse(ctx, "Note not found")   // 404
            return
        }
        api.InternalServerError(ctx, "Failed to get note") // 500
        log.Error().Err(err).Msg("Error get note by id")
        return
    }
    // map entity → response DTO
}
```

### Why `%w` and not `%v`

```go
return nil, fmt.Errorf("context: %w", err)  // ✅ wraps — errors.Is still finds ErrNotFound
return nil, fmt.Errorf("context: %v", err)  // ❌ does NOT wrap — sentinel is lost
```

`errors.Is` walks the full chain, so even wrapped multiple times the sentinel is still detectable:

```go
// repo returns:    ErrNotFound
// service wraps:  "NoteService.GetNoteById: not found"
// handler checks:
errors.Is(err, repositories.ErrNotFound) // ✅ true — unwraps the chain
```

**Which handlers need error differentiation?**

- Single-resource fetch by ID → yes (`GetById`, `Update`, `Delete`)
- List endpoints → no, return empty array instead of 404

### Always return after error response

```go
if err != nil {
    api.InternalServerError(ctx, "...")
    return  // ← never forget this, or code falls through on nil pointer
}
```

### What error message to send to the frontend

**Rule: logs are for developers, responses are for users.**

- Real error → `log.Error().Err(err).Msg(...)` (server side only)
- Safe message → `api.XxxResponse(ctx, "...")` (what frontend receives)

Never send internal error details (DB errors, stack traces, service logic messages) to the frontend. It leaks system internals and is a security risk.

**400 — Validation / bad input** → safe to be specific, user needs to know what to fix

```go
if err := ctx.ShouldBindJSON(&req); err != nil {
    api.BadRequestResponse(ctx, "Title is required")  // ✅ specific, helps the user
    return
}
```

**401 — Auth errors** → always generic, never reveal WHY it failed (prevents user enumeration)

```go
// ❌ wrong — reveals whether the account exists
api.UnauthorizedResponse(ctx, "user not found")
api.UnauthorizedResponse(ctx, "wrong password")

// ✅ correct — one generic message for all auth failures
api.UnauthorizedResponse(ctx, "invalid credentials")
```

**403 — Forbidden** → generic, don't explain what permission is missing

```go
api.ForbiddenResponse(ctx, "forbidden")  // ✅ not "you need admin role to do this"
```

**404 — Not found** → safe to say what wasn't found, but don't leak existence of private resources

```go
// public resource (note owned by the requesting user) — safe to be specific
api.NotFoundResponse(ctx, "Note not found")  // ✅

// private/sensitive resource — don't confirm it exists
api.NotFoundResponse(ctx, "Not found")  // ✅ not "User account not found"
```

**500 — Internal server error** → always generic. Log the real error, never send it.

```go
note, err := h.noteService.GetNoteById(ctx, id)
if err != nil {
    if errors.Is(err, repositories.ErrNotFound) {
        api.NotFoundResponse(ctx, "Note not found")
        return
    }
    // real error goes to log only
    log.Error().Err(err).Str("id", id).Msg("GetNoteById failed")
    api.InternalServerError(ctx, "Something went wrong")  // ✅ generic, not err.Error()
    return
}

// ❌ never do this — sends internal details to frontend
api.InternalServerError(ctx, err.Error())
```

**External service errors (OAuth, third-party APIs)** → always generic, log the real one

```go
token, err := s.oauthConfig.Google.Exchange(ctx, code)
if err != nil {
    log.Error().Err(err).Msg("Google OAuth exchange failed")
    return nil, fmt.Errorf("GoogleCallback exchange: %w", err)
    // handler will show: "Login failed, please try again" — not the Google error
}
```

**Summary table:**

| Error type                     | Frontend message            | Log real error?   |
| ------------------------------ | --------------------------- | ----------------- |
| Validation (400)               | specific, helpful           | no (user mistake) |
| Auth failure (401)             | always generic              | yes if suspicious |
| Forbidden (403)                | generic                     | yes               |
| Not found (404)                | what wasn't found (if safe) | no                |
| Internal / service logic (500) | "Something went wrong"      | **always**        |
| External API failure (500)     | generic                     | **always**        |

---

## 3. Authentication & Context

- User ID comes from the JWT token, not request body
- Middleware validates token and sets user ID in context: `ctx.Set("userID", claims.Subject)`
- Handler reads it: `userID := ctx.GetString("userID")`
- No need to check for empty `userID` in handlers behind `authMiddleware` — middleware aborts before handler runs if token is invalid

---

## 4. HTTP Status Codes Quick Reference

| Situation                     | Code |
| ----------------------------- | ---- |
| Success with body             | 200  |
| Created                       | 201  |
| Success no body               | 204  |
| Bad input / validation fail   | 400  |
| Missing/invalid token         | 401  |
| Valid token but no permission | 403  |
| Resource doesn't exist        | 404  |
| Unexpected server error       | 500  |

---

## 5. DTOs vs Entities

| Type             | Where defined        | Where used    | Purpose           |
| ---------------- | -------------------- | ------------- | ----------------- |
| `entities.X`     | `internal/entities/` | repo, service | DB row shape      |
| `dtos.XRequest`  | `internal/dtos/`     | handler only  | bind HTTP input   |
| `dtos.XResponse` | `internal/dtos/`     | handler only  | shape JSON output |

Response DTOs are just Go structs with `json` tags — handler maps entity fields into them before calling `api.JsonResponse`.

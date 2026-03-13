# Auth Plan: OAuth2 with Google & GitHub + JWT

## Overview

Add stateless JWT-based OAuth2 authentication supporting Google and GitHub.

After the OAuth callback, the backend redirects the user to the frontend with the JWT
delivered as a URL fragment (`#token=...`). Fragments are never sent to servers, so the
token won't appear in access logs or `Referer` headers.

Notes are bifurcated:

- **Global notes** (max 3, no auth required) → existing `/api/v1/notes` routes, unchanged
- **User-scoped notes** (unlimited, auth required) → new `/api/v1/me/notes` routes

---

## New Dependencies

```bash
go get golang.org/x/oauth2
go get github.com/golang-jwt/jwt/v5
```

---

## Implementation Steps

### Step 1 — Constants

**File**: `internal/constants/constants.go`

Add OAuth2 + JWT env key constants to the `envKeys` struct:

```
GOOGLE_CLIENT_ID      ✅
GOOGLE_CLIENT_SECRET  ✅
GOOGLE_REDIRECT_URL   ✅
GITHUB_CLIENT_ID      ❌ not added
GITHUB_CLIENT_SECRET  ❌ not added
GITHUB_REDIRECT_URL   ❌ not added
JWT_SECRET            ✅ (read directly via GetEnvOrPanic, not as a constant)
FRONTEND_URL          ✅
```

- [x] Done (partial — GitHub env keys missing; add when GitHub OAuth is implemented)

---

### Step 2 — Config

**File**: `internal/configs/config.go`

- `OAuthGoogle` — improvised: full `*oauth2.Config` struct used instead of a plain credentials struct ✅
- `OAuthGithub` — ❌ not added
- `JWT.Secret` — improvised: `JWTSecret string` lives directly on `OAuthConfig` instead of a separate struct ✅
- `FrontendURL string` on `Config` — ❌ not added; currently hardcoded in auth service
- `NewCors()` includes `"Authorization"` in `AllowHeaders` ✅

- [x] Done (partial — `FrontendURL` not wired into Config; GitHub OAuth config missing)

---

### Step 3 — User & OAuthAccount Entities

**Files**: `internal/entities/user_entity.go`, `internal/entities/oauth_account_entity.go`

Email is the **identity anchor**. Provider details live in a separate table so one user can link multiple providers.

- `User` struct ✅
- `OAuthAccount` struct ✅

- [x] Done

---

### Step 4 — DB Migration

**File**: `internal/database/db.go`

- `createUserTable` — `id`, `email` (UNIQUE), `name`, `avatar_url`, `created_at`, `updated_at` ✅
- `createOAuthAccountTable` — `id`, `user_id` (FK → users, ON DELETE CASCADE), `provider`, `provider_id`, `created_at`; UNIQUE on `(provider, provider_id)` ✅
- `createNoteTable` — nullable `user_id TEXT REFERENCES users(id)` added ✅
- `InitializeTable` calls all three in order ✅
- `SeedGlobalNotes` helper added (seeds 3 global notes, skips if already ≥ 3) ✅
- `WithTx` transaction helper added ✅

- [x] Done

---

### Step 5 — User & OAuthAccount Repositories

**Files**: `internal/repositories/user_repository.go`, `internal/repositories/oauth_account_repository.go`

Improvisation: both repos use `database.DBTX` interface instead of `*sql.DB` directly — allows passing a `*sql.Tx` for transactional operations ✅

**`UserRepository`**:

- `Create(ctx, user)` ✅
- `FindByEmail(ctx, email)` ❌ not implemented — auth service currently skips the email-lookup step and always creates a new user if no OAuth account is found

**`OAuthAccountRepository`**:

- `FindByProviderID(ctx, provider, providerID)` ✅ (improvised: returns `string` userID directly rather than `*entities.OAuthAccount`)
- `Create(ctx, account)` ✅

**Remaining**:

- [ ] Add `FindByEmail` to `UserRepository`
- [ ] Update `GoogleCallback` in auth service to look up by email before creating a new user

- [x] Done (partial — `FindByEmail` missing; email-based account linking not implemented)

---

### Step 6 — Auth DTOs

**File**: `internal/dtos/auth_dto.go` _(new)_

```go
type AuthTokenResponse struct {
    AccessToken string `json:"access_token"`
    TokenType   string `json:"token_type"`
    ExpiresIn   int64  `json:"expires_in"`
}
```

- [ ] Done — token is returned via URL fragment redirect, so this DTO is low priority for v1; add if a direct token endpoint is needed

---

### Step 7 — Auth Service

**File**: `internal/services/auth_service.go`

Improvised struct (uses `*configs.OAuthConfig` instead of individual fields):

```go
type AuthService struct {
    db          *sql.DB
    userRepo    *repositories.UserRepository
    oauthRepo   *repositories.OAuthAccountRepository
    oauthConfig *configs.OAuthConfig
}
```

| Method                             | Status | Notes                                                                                                                   |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GetGoogleAuthURL()`               | ✅     | Improvised: uses PKCE (`S256ChallengeOption`) — state JWT embeds the verifier                                           |
| `GoogleCallback(ctx, code, state)` | ✅     | Validates state JWT, exchanges code with PKCE verifier, creates user + oauth_account in a transaction                   |
| `GetGithubAuthURL()`               | ❌     | Not implemented                                                                                                         |
| `GithubCallback(ctx, code, state)` | ❌     | Not implemented                                                                                                         |
| `ValidateToken(tokenStr)`          | ❌     | Private `validateStateToken` exists for state JWTs; no public method to validate app JWTs — **required for middleware** |
| `generateStateToken(verifier)`     | ✅     | Private                                                                                                                 |
| `validateStateToken(state)`        | ✅     | Private                                                                                                                 |
| `generateAppToken(userID)`         | ✅     | Private; 24 h expiry, `Subject` = `userID`                                                                              |

**Known issues**:

- Redirect URL is hardcoded to `http://localhost:5173#token=<jwt>` — should use `FrontendURL` from config
- Email-based account linking not implemented (skips `FindByEmail` step)

**Remaining**:

- [ ] Add public `ValidateToken(tokenStr string) (*jwt.RegisteredClaims, error)` (wraps `jwt.ParseWithClaims` with `oauthConfig.JWTSecret`)
- [ ] Add `frontendURL string` field to `AuthService`, populate from config, use in redirect
- [ ] Implement GitHub auth (`GetGithubAuthURL`, `GithubCallback`)
- [ ] Implement email-based account linking using `UserRepository.FindByEmail`

- [x] Done (partial — Google auth works; token validation, FrontendURL wiring, and GitHub missing)

---

### Step 8 — Auth Handler

**File**: `internal/api/handlers/auth_handler.go`

| Method           | Route                       | Status |
| ---------------- | --------------------------- | ------ |
| `GoogleLogin`    | `GET /auth/google`          | ✅     |
| `GoogleCallback` | `GET /auth/google/callback` | ✅     |
| `GithubLogin`    | `GET /auth/github`          | ❌     |
| `GithubCallback` | `GET /auth/github/callback` | ❌     |
| `Me`             | `GET /auth/me`              | ❌     |

**Remaining**:

- [ ] Add `Me(ctx)` handler — reads `userID` from gin context (set by middleware), returns `{"user_id": "..."}`
- [ ] Add GitHub handlers when GitHub OAuth is implemented

- [x] Done (partial — Google handlers done; `Me` and GitHub missing)

---

### Step 9 — JWT Middleware

**File**: `internal/api/middleware/auth_middleware.go` _(new — does not exist yet)_

`RequireAuth(authService *services.AuthService) gin.HandlerFunc`

1. Read `Authorization: Bearer <token>` header
2. Call `authService.ValidateToken(token)`
3. Set `userID` (from `claims.Subject`) into gin context via `ctx.Set("userID", ...)`
4. On failure → `api.UnauthorizedResponse(ctx, "...")` + `ctx.Abort()`

Also add `UnauthorizedResponse` helper to `internal/api/response.go` (currently missing).

- [ ] Done

---

### Step 10 — Auth Routes

**File**: `internal/api/routes/auth_route.go`

Current state — signature does not accept `authMiddleware`; only Google routes registered:

```go
func RegisterAuthRoutes(route *gin.RouterGroup, h *handlers.AuthHandler)
```

**Remaining**:

- [ ] Add `authMiddleware gin.HandlerFunc` parameter
- [ ] Register `GET /auth/me` protected with `authMiddleware`
- [ ] Register GitHub routes when ready

- [x] Done (partial — Google routes wired; middleware parameter and `/auth/me` route missing)

---

### Step 11 — User Notes Routes

**File**: `internal/api/routes/note_route.go`

Current state — `RegisterNoteRoutes` only registers the public `/notes` group; no `/me/notes` group exists.

**Remaining**:

- [ ] Add `authMiddleware gin.HandlerFunc` parameter to `RegisterNoteRoutes`
- [ ] Add `/me/notes` route group protected with `authMiddleware`:

```
GET    /me/notes        → GetUserNotes
POST   /me/notes        → CreateUserNote
PATCH  /me/notes/:id    → UpdateUserNote
DELETE /me/notes/:id    → DeleteUserNote
```

Existing `/notes` routes stay public and unchanged.

- [ ] Done

---

### Step 12 — Note Entity & Repo Updates

**Files**: `internal/entities/note_entity.go`, `internal/repositories/note_repository.go`

Current state — `Note` entity has no `UserID` field; all repository queries are global (no user filter).

**Remaining**:

- [ ] Add `UserID *string` to `Note` entity
- [ ] Add `GetAllByUserID(ctx, userID string) ([]*entities.Note, error)`
- [ ] Add `GetLastPositionAtByUserID(ctx, userID string) (*int64, error)`
- [ ] Add `CreateForUser(ctx, note *entities.Note) error` — INSERT with `user_id` populated
- [ ] Add `UpdateForUser(ctx, req *dtos.UpdateNoteRequest, userID string) error` — UPDATE with `AND user_id = $n` guard
- [ ] Add `DeleteForUser(ctx, req *dtos.DeleteNoteRequest, userID string) error` — DELETE with `AND user_id = $n` guard
- [ ] Enforce global note cap (max 3 where `user_id IS NULL`) inside existing `Create` — `SELECT COUNT(*) FROM notes WHERE user_id IS NULL`; return sentinel error if count ≥ 3

- [ ] Done

---

### Step 13 — Service & Handler Updates

**Files**: `internal/services/note_service.go`, `internal/api/handlers/note_handler.go`

Current state — all service and handler methods are global; no user-aware methods exist.

**Remaining**:

Add to `NoteService`:

- [ ] `GetUserNotes(ctx, userID string) ([]*dtos.NoteResponse, error)` — calls `GetAllByUserID`; auto-creates first note for new user if list is empty
- [ ] `CreateUserNote(ctx, userID string) (*dtos.CreateNoteResponse, error)`
- [ ] `UpdateUserNote(ctx, userID string, req *dtos.UpdateNoteRequest) error`
- [ ] `DeleteUserNote(ctx, userID string, req *dtos.DeleteNoteRequest) error`

Add to `NoteHandler`:

- [ ] `GetUserNotes(ctx)` — reads `userID` from `ctx.MustGet("userID").(string)`
- [ ] `CreateUserNote(ctx)`
- [ ] `UpdateUserNote(ctx)`
- [ ] `DeleteUserNote(ctx)`

- [ ] Done

---

### Step 14 — Wire Everything

**File**: `internal/app/application.go`

Current state — `UserRepository`, `OAuthAccountRepository`, `AuthService`, `AuthHandler` are all instantiated and `RegisterAuthRoutes` is called ✅. However, no middleware is instantiated or passed to either route registrar.

**Remaining**:

- [ ] Instantiate `authMiddleware := middleware.RequireAuth(authService)` after `authService` is created
- [ ] Update `RegisterAuthRoutes(v1, authHandler)` → `RegisterAuthRoutes(v1, authHandler, authMiddleware)`
- [ ] Update `RegisterNoteRoutes(v1, noteHandler, hub)` → `RegisterNoteRoutes(v1, noteHandler, hub, authMiddleware)`
- [ ] Add `FrontendURL` to `Config` struct and pass it into `AuthService`

- [x] Done (partial — core wiring done; middleware not wired; FrontendURL not injected)

---

## New `.env` Variables

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=http://localhost:8080/api/v1/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URL=http://localhost:8080/api/v1/auth/github/callback

JWT_SECRET=your-256-bit-secret
FRONTEND_URL=http://localhost:3000
```

---

## Decisions & Rationale

| Decision         | Choice                                            | Reason                                                      |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Token type       | JWT (stateless)                                   | No session store required, scales easily                    |
| Token delivery   | URL fragment `#token=...`                         | Not sent to servers; safe from logs/Referer leaks           |
| OAuth state      | Signed short-lived JWT embedding PKCE verifier    | No DB/Redis needed; PKCE adds code-interception protection  |
| Account linking  | Email as identity anchor + `oauth_accounts` table | Same person can log in with Google or GitHub → one user row |
| Repo interface   | `database.DBTX` instead of `*sql.DB`              | Allows injecting a `*sql.Tx` for transactional writes       |
| Global notes cap | Max 3 (enforced in service/repo layer)            | Simple application-level guard                              |
| Note ownership   | `/me/notes` is a new separate group               | Zero breaking changes to existing `/notes` routes           |
| Token refresh    | Not included in v1                                | Keep scope small; can add refresh tokens later              |
| JWT expiry       | 24 h (improvised from original 7 days)            | Shorter expiry, can be revisited                            |

---

## Remaining Work Summary

| Step    | What's left                                                                    |
| ------- | ------------------------------------------------------------------------------ |
| Step 5  | `UserRepository.FindByEmail` + email-based account linking in `GoogleCallback` |
| Step 7  | Public `ValidateToken` method; `FrontendURL` from config; GitHub OAuth         |
| Step 8  | `Me` handler; GitHub handlers                                                  |
| Step 9  | Create `auth_middleware.go`; add `UnauthorizedResponse` to `response.go`       |
| Step 10 | Add middleware param; register `/auth/me` route                                |
| Step 11 | Add `/me/notes` route group with middleware                                    |
| Step 12 | `UserID *string` on entity; user-scoped repo methods; global cap enforcement   |
| Step 13 | User-scoped service & handler methods                                          |
| Step 14 | Wire middleware; inject `FrontendURL`                                          |

---

## Verification Checklist

- [ ] `GET /api/v1/auth/google` returns `302` → Google consent screen
- [ ] `GET /api/v1/auth/github` returns `302` → GitHub authorization page
- [ ] After OAuth flow, browser lands on `{FRONTEND_URL}#token=<jwt>`
- [ ] `GET /api/v1/auth/me` with valid `Authorization: Bearer <token>` returns user info
- [ ] `GET /api/v1/auth/me` without token returns `401`
- [ ] `GET /api/v1/notes` returns global notes without auth (no breaking change)
- [ ] `GET /api/v1/me/notes` returns `401` without token
- [ ] `GET /api/v1/me/notes` returns user notes with valid token
- [ ] Global notes are capped at 3; creating a 4th returns an error
- [ ] `go mod tidy` passes with no errors

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
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URL
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_REDIRECT_URL
JWT_SECRET
FRONTEND_URL
```

- [ ] Done

---

### Step 2 — Config

**File**: `internal/configs/config.go`

- Add `OAuthGoogle` struct: `ClientID`, `ClientSecret`, `RedirectURL`
- Add `OAuthGithub` struct: same fields
- Add `JWT` struct: `Secret string`
- Add `FrontendURL string`
- Update `NewCors()` to include `"Authorization"` in `AllowHeaders`

- [ ] Done

---

### Step 3 — User & OAuthAccount Entities

**Files**: `internal/entities/user_entity.go` _(new)_, `internal/entities/oauth_account_entity.go` _(new)_

Email is the **identity anchor**. Provider details live in a separate table so one user can link multiple providers.

```go
// user_entity.go
type User struct {
    ID        string
    Email     string
    Name      string
    AvatarURL string
    CreatedAt string
    UpdatedAt string
}

// oauth_account_entity.go
type OAuthAccount struct {
    ID         string
    UserID     string // FK → users.id
    Provider   string // "google" | "github"
    ProviderID string // provider's own user ID
    CreatedAt  string
}
```

- [ ] Done

---

### Step 4 — DB Migration

**File**: `internal/database/db.go`

- Add `createUserTable(db)` — `id`, `email` (UNIQUE), `name`, `avatar_url`, `created_at`, `updated_at`
- Add `createOAuthAccountTable(db)` — `id`, `user_id` (FK → users), `provider`, `provider_id`, `created_at`; UNIQUE constraint on `(provider, provider_id)`
- Update `createNoteTable` to add nullable `user_id TEXT REFERENCES users(id)`
- Add a partial index to cap global notes (where `user_id IS NULL`) at 3 via application logic
- Call all three from `InitializeTable` in order: users → oauth_accounts → notes

- [ ] Done

---

### Step 5 — User & OAuthAccount Repositories

**Files**: `internal/repositories/user_repository.go` _(new)_, `internal/repositories/oauth_account_repository.go` _(new)_

Same `*sql.DB` injection pattern as `NoteRepository`.

**`UserRepository`** methods:

- `FindByEmail(ctx, email string) (*entities.User, error)`
- `Create(ctx, user *entities.User) (*entities.User, error)`

**`OAuthAccountRepository`** methods:

- `FindByProviderID(ctx, provider, providerID string) (*entities.OAuthAccount, error)`
- `Create(ctx, account *entities.OAuthAccount) (*entities.OAuthAccount, error)`

- [ ] Done

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

- [ ] Done

---

### Step 7 — Auth Service

**File**: `internal/services/auth_service.go` _(new)_

```go
type AuthService struct {
    userRepo         *repositories.UserRepository
    oauthAccountRepo *repositories.OAuthAccountRepository
    googleConfig     *oauth2.Config
    githubConfig     *oauth2.Config
    jwtSecret        string
    frontendURL      string
}
```

Methods:

- `GetGoogleAuthURL(state string) string`
- `GetGithubAuthURL(state string) string`
- `HandleGoogleCallback(ctx, code, state) (jwtString string, error)`
- `HandleGithubCallback(ctx, code, state) (jwtString string, error)`
- `ValidateToken(tokenStr string) (*Claims, error)`
- `GenerateStateToken() (string, error)` — signs a short-lived JWT as state (no DB needed)
- `ValidateStateToken(state string) error`

**Account linking flow inside `HandleXxxCallback`**:

1. Exchange code for OAuth token, fetch user profile (email, name, avatar) from provider
2. Look up `oauth_accounts` by `(provider, provider_id)`
   - **Found** → load the linked `users` row → issue JWT
   - **Not found** → look up `users` by `email`
     - **Found** → insert new `oauth_accounts` row linking this provider → issue JWT
     - **Not found** → insert new `users` row + new `oauth_accounts` row → issue JWT
3. JWT claims include `user_id` and `email`

- [ ] Done

---

### Step 8 — Auth Handler

**File**: `internal/api/handlers/auth_handler.go` _(new)_

| Method           | Route                       | Description                                                                       |
| ---------------- | --------------------------- | --------------------------------------------------------------------------------- |
| `GoogleLogin`    | `GET /auth/google`          | Generate state JWT → redirect to Google consent URL                               |
| `GoogleCallback` | `GET /auth/google/callback` | Validate state, exchange code, issue JWT → redirect to `{FRONTEND_URL}#token=xxx` |
| `GithubLogin`    | `GET /auth/github`          | Same for GitHub                                                                   |
| `GithubCallback` | `GET /auth/github/callback` | Same for GitHub                                                                   |
| `Me`             | `GET /auth/me`              | Return current user profile from JWT claims (protected)                           |

- [ ] Done

---

### Step 9 — JWT Middleware

**File**: `internal/api/middleware/auth_middleware.go` _(new)_

`RequireAuth(authService *services.AuthService) gin.HandlerFunc`

1. Read `Authorization: Bearer <token>` header
2. Call `authService.ValidateToken(token)`
3. Inject `userID` and `userEmail` into Gin context via `ctx.Set`
4. On failure → `api.UnauthorizedResponse(ctx, "...")` + `ctx.Abort()`

Also add `UnauthorizedResponse` helper to `internal/api/response.go`.

- [ ] Done

---

### Step 10 — Auth Routes

**File**: `internal/api/routes/auth_route.go` _(new)_

```go
func RegisterAuthRoutes(
    rg *gin.RouterGroup,
    h *handlers.AuthHandler,
    authMiddleware gin.HandlerFunc,
)
```

Routes registered under `/auth`:

```
GET /auth/google
GET /auth/google/callback
GET /auth/github
GET /auth/github/callback
GET /auth/me        ← protected with authMiddleware
```

- [ ] Done

---

### Step 11 — User Notes Routes

**File**: `internal/api/routes/note_route.go`

Add a second group `/me/notes` with `RequireAuth` middleware:

```
GET    /me/notes        → GetUserNotes
POST   /me/notes        → CreateUserNote
PUT    /me/notes/:id    → UpdateUserNote
DELETE /me/notes/:id    → DeleteUserNote
```

Existing `/notes` routes stay public and unchanged.

- [ ] Done

---

### Step 12 — Note Entity & Repo Updates

**Files**: `internal/entities/note_entity.go`, `internal/repositories/note_repository.go`

- Add `UserID *string` to `Note` entity
- Add user-scoped repo methods: `GetAllByUserID`, `CreateForUser`, `UpdateForUser`, `DeleteForUser`
- Enforce global note cap (max 3 where `user_id IS NULL`) inside `Create`

- [ ] Done

---

### Step 13 — Service & Handler Updates

**Files**: `internal/services/note_service.go`, `internal/api/handlers/note_handler.go`

- Add user-scoped service methods (wrap user-scoped repo methods)
- Add handler methods that extract `userID` from Gin context (set by middleware)

- [ ] Done

---

### Step 14 — Wire Everything

**File**: `internal/app/application.go`

Inside `RegisterRoutes`:

1. Instantiate `UserRepository → OAuthAccountRepository → AuthService → AuthHandler → authMiddleware`
2. Call `routes.RegisterAuthRoutes(v1, authHandler, authMiddleware.RequireAuth())`
3. Pass `authMiddleware` to `RegisterNoteRoutes` so `/me/notes` can use it

- [ ] Done

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
| OAuth state      | Signed short-lived JWT                            | No DB/Redis needed for nonce storage                        |
| Account linking  | Email as identity anchor + `oauth_accounts` table | Same person can log in with Google or GitHub → one user row |
| Global notes cap | Max 3 (enforced in service layer)                 | Simple application-level guard                              |
| Note ownership   | `/me/notes` is a new separate group               | Zero breaking changes to existing `/notes` routes           |
| Token refresh    | Not included in v1                                | Keep scope small; can add refresh tokens later              |
| JWT expiry       | 7 days                                            | Reasonable default for a notes app                          |

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

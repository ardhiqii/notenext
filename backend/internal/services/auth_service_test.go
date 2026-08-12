package services_test

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

const testJWTSecret = "test-secret"

func setupAuthService(t *testing.T) (*services.AuthService, *sql.DB) {
	t.Helper()
	return setupAuthServiceWithOAuth(t, &configs.OAuthConfig{
		JWTSecret: testJWTSecret,
		Google: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: "https://oauth2.googleapis.com/token",
			},
		},
	})
}

// setupAuthServiceWithOAuth builds an AuthService with a custom Google OAuth
// config so tests can point TokenURL at a local httptest server.
func setupAuthServiceWithOAuth(t *testing.T, oauthCfg *configs.OAuthConfig) (*services.AuthService, *sql.DB) {
	t.Helper()
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	svc := services.NewAuthService(
		db,
		repositories.NewUserRepository(db),
		repositories.NewOAuthAccountRepository(db),
		repositories.NewRefreshTokenRepository(db),
		oauthCfg,
	)
	return svc, db
}

// ──────────────────────────────────────────────
// Register validation hardening (bug #5)
// ──────────────────────────────────────────────

func TestRegister_TrimsUsernameAndName(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	if _, err := svc.Register(ctx, "  alice  ", "password123", "  Alice  "); err != nil {
		t.Fatalf("register: %v", err)
	}

	user, err := repositories.NewUserRepository(db).FindByUsername(ctx, "alice")
	if err != nil {
		t.Fatalf("find trimmed username: %v", err)
	}
	if user.Username != "alice" {
		t.Fatalf("expected trimmed username %q, got %q", "alice", user.Username)
	}
	if user.Name != "Alice" {
		t.Fatalf("expected trimmed name %q, got %q", "Alice", user.Name)
	}
}

func TestRegister_UsernameTooLong_Rejected(t *testing.T) {
	svc, _ := setupAuthService(t)
	_, err := svc.Register(context.Background(), strings.Repeat("a", 51), "password123", "Alice")
	if err == nil || !strings.Contains(err.Error(), "at most 50") {
		t.Fatalf("expected max-length error, got %v", err)
	}
}

func TestRegister_NameTooLong_Rejected(t *testing.T) {
	svc, _ := setupAuthService(t)
	_, err := svc.Register(context.Background(), "alice", "password123", strings.Repeat("n", 101))
	if err == nil || !strings.Contains(err.Error(), "at most 100") {
		t.Fatalf("expected max-length error, got %v", err)
	}
}

func TestRegister_PasswordOver72Bytes_Rejected(t *testing.T) {
	svc, _ := setupAuthService(t)
	_, err := svc.Register(context.Background(), "alice", strings.Repeat("p", 73), "Alice")
	if err == nil || !strings.Contains(err.Error(), "at most 72") {
		t.Fatalf("expected 72-byte limit error, got %v", err)
	}
}

func TestRegister_PasswordExactly72Bytes_Accepted(t *testing.T) {
	svc, _ := setupAuthService(t)
	if _, err := svc.Register(context.Background(), "alice", strings.Repeat("p", 72), "Alice"); err != nil {
		t.Fatalf("72-byte password should be accepted, got %v", err)
	}
}

func TestRegister_DuplicateUsername_ReturnsCleanError(t *testing.T) {
	svc, _ := setupAuthService(t)
	ctx := context.Background()

	if _, err := svc.Register(ctx, "alice", "password123", "Alice"); err != nil {
		t.Fatalf("first register: %v", err)
	}
	_, err := svc.Register(ctx, "alice", "password456", "Alice Clone")
	if !errors.Is(err, repositories.ErrUsernameTaken) {
		t.Fatalf("expected ErrUsernameTaken, got %v", err)
	}
	if err.Error() != "username already taken" {
		t.Fatalf("expected clean message, got %q", err.Error())
	}
}

// ──────────────────────────────────────────────
// SetCredentials (Settings: username & password together)
// ──────────────────────────────────────────────

func TestSetCredentials_SetsBothAtOnce(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	// A Google-only user: registered with no username/password binding.
	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := svc.SetCredentials(ctx, user.ID, "alice", "password123"); err != nil {
		t.Fatalf("set credentials: %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "alice" {
		t.Fatalf("expected username %q, got %q", "alice", after.Username)
	}
	if after.PasswordHash == "" {
		t.Fatal("expected password_hash to be set")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(after.PasswordHash), []byte("password123")); err != nil {
		t.Fatalf("password hash does not match: %v", err)
	}
}

func TestSetCredentials_ShortPassword_Rejected_NoPartialWrite(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	err = svc.SetCredentials(ctx, user.ID, "alice", "short")
	if err == nil || !strings.Contains(err.Error(), "at least 8") {
		t.Fatalf("expected min-length error, got %v", err)
	}

	// Neither field must have been written.
	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "" {
		t.Fatalf("expected username untouched, got %q", after.Username)
	}
	if after.PasswordHash != "" {
		t.Fatal("expected password_hash untouched")
	}
}

func TestSetCredentials_ShortUsername_Rejected_NoPartialWrite(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	err = svc.SetCredentials(ctx, user.ID, "ab", "password123")
	if err == nil || !strings.Contains(err.Error(), "at least 3") {
		t.Fatalf("expected min-length error, got %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "" {
		t.Fatalf("expected username untouched, got %q", after.Username)
	}
	if after.PasswordHash != "" {
		t.Fatal("expected password_hash untouched")
	}
}

func TestSetCredentials_DuplicateUsername_Rejected(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	repo := repositories.NewUserRepository(db)
	if _, err := repo.Create(ctx, &entities.User{Username: "alice", Name: "Alice"}); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	user, err := repo.Create(ctx, &entities.User{Name: "Bob"})
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}

	err = svc.SetCredentials(ctx, user.ID, "alice", "password123")
	if !errors.Is(err, repositories.ErrUsernameTaken) {
		t.Fatalf("expected ErrUsernameTaken, got %v", err)
	}

	after, err := repo.FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find bob: %v", err)
	}
	if after.PasswordHash != "" {
		t.Fatal("expected bob password_hash untouched")
	}
}

// The standalone bind endpoints must NOT allow half-configured login methods:
// a user with no username cannot set a password alone, and a user with no
// password cannot set a username alone — both go through SetCredentials.

func TestSetPassword_NoUsername_Rejected(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	err = svc.SetPassword(ctx, user.ID, "password123")
	if err == nil || !strings.Contains(err.Error(), "username and password together") {
		t.Fatalf("expected combined-setup error, got %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.PasswordHash != "" {
		t.Fatal("expected password_hash untouched")
	}
}

func TestSetUsername_NoPassword_Rejected(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	err = svc.SetUsername(ctx, user.ID, "alice")
	if err == nil || !strings.Contains(err.Error(), "username and password together") {
		t.Fatalf("expected combined-setup error, got %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "" {
		t.Fatalf("expected username untouched, got %q", after.Username)
	}
}

func TestSetUsername_WithPassword_Allowed(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	// Existing username+password user changing just the username is fine.
	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{Username: "oldname", Name: "Alice"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := svc.SetPassword(ctx, user.ID, "password123"); err != nil {
		t.Fatalf("set password: %v", err)
	}

	if err := svc.SetUsername(ctx, user.ID, "newname"); err != nil {
		t.Fatalf("set username: %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "newname" {
		t.Fatalf("expected username %q, got %q", "newname", after.Username)
	}
	if after.PasswordHash == "" {
		t.Fatal("expected password_hash still set")
	}
}

// ──────────────────────────────────────────────
// Refresh token expiry (bug #1b)
// ──────────────────────────────────────────────

func TestGenerateAccessTokenWithRefreshToken_ValidToken(t *testing.T) {
	svc, _ := setupAuthService(t)
	ctx := context.Background()

	authToken, err := svc.Register(ctx, "alice", "password123", "Alice")
	if err != nil {
		t.Fatalf("register: %v", err)
	}

	access, err := svc.GenerateAccessTokenWithRefreshToken(ctx, authToken.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if access == "" {
		t.Fatal("expected non-empty access token")
	}
}

func TestGenerateAccessTokenWithRefreshToken_ExpiredToken_ReturnsNotFound(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	authToken, err := svc.Register(ctx, "alice", "password123", "Alice")
	if err != nil {
		t.Fatalf("register: %v", err)
	}

	if _, err := db.Exec(`UPDATE refresh_tokens SET expires_at = '2020-01-01 00:00:00'`); err != nil {
		t.Fatalf("backdate token: %v", err)
	}

	_, err = svc.GenerateAccessTokenWithRefreshToken(ctx, authToken.RefreshToken)
	if !errors.Is(err, repositories.RepoErrors.NotFound) {
		t.Fatalf("expected NotFound for expired refresh token, got %v", err)
	}
}

// ──────────────────────────────────────────────
// Google bind mode (bug #4)
// ──────────────────────────────────────────────

func extractState(t *testing.T, rawURL string) string {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	state := u.Query().Get("state")
	if state == "" {
		t.Fatalf("no state param in url %q", rawURL)
	}
	return state
}

func TestGoogleCallback_BindModeWithoutUserID_ReturnsCleanErrorNotPanic(t *testing.T) {
	svc, _ := setupAuthService(t)

	// Bind flow started without an authenticated session (empty userID).
	bindURL, err := svc.GetGoogleBindURL("")
	if err != nil {
		t.Fatalf("GetGoogleBindURL: %v", err)
	}
	state := extractState(t, bindURL)

	// Previously this path panicked on a nil type assertion; it must now
	// return a clean, mappable error before any OAuth exchange happens.
	_, err = svc.GoogleCallback(context.Background(), "dummy-code", state)
	if !errors.Is(err, services.ErrBindRequiresAuth) {
		t.Fatalf("expected ErrBindRequiresAuth, got %v", err)
	}
}

func TestGetGoogleBindURL_EmbedsUserIDInSignedState(t *testing.T) {
	svc, _ := setupAuthService(t)
	bindURL, err := svc.GetGoogleBindURL("user-123")
	if err != nil {
		t.Fatalf("GetGoogleBindURL: %v", err)
	}
	state := extractState(t, bindURL)

	claims := struct {
		BindMode bool `json:"bind_mode,omitempty"`
		jwt.RegisteredClaims
	}{}
	_, err = jwt.ParseWithClaims(state, &claims, func(t *jwt.Token) (any, error) {
		return []byte(testJWTSecret), nil
	})
	if err != nil {
		t.Fatalf("parse state token: %v", err)
	}
	if !claims.BindMode {
		t.Fatal("expected bind_mode=true in state token")
	}
	if claims.Subject != "user-123" {
		t.Fatalf("expected subject %q in state token, got %q", "user-123", claims.Subject)
	}
}

func TestStateToken_ExpiresAfterWindow(t *testing.T) {
	svc, _ := setupAuthService(t)

	loginURL, err := svc.GetGoogleAuthURL()
	if err != nil {
		t.Fatalf("GetGoogleAuthURL: %v", err)
	}
	state := extractState(t, loginURL)

	claims := struct {
		jwt.RegisteredClaims
	}{}
	if _, err := jwt.ParseWithClaims(state, &claims, func(t *jwt.Token) (any, error) {
		return []byte(testJWTSecret), nil
	}); err != nil {
		t.Fatalf("parse state token: %v", err)
	}
	if claims.ExpiresAt == nil {
		t.Fatal("expected expiry on state token")
	}
	if time.Until(claims.ExpiresAt.Time) > 10*time.Minute {
		t.Fatalf("state token expiry too far in the future: %v", time.Until(claims.ExpiresAt.Time))
	}
}

// ──────────────────────────────────────────────
// Account binding — both directions
//   1) Google account → + username/password (Settings combined form)
//   2) id/pw account → + Google (auto-bind on login, manual bind via Settings)
// ──────────────────────────────────────────────

// mockGoogleAuth spins up a fake Google token endpoint and intercepts the
// hardcoded userinfo URL (openidconnect.googleapis.com/v1/userinfo) so
// GoogleCallback can complete without touching the real Google.
func mockGoogleAuth(t *testing.T, userinfoJSON string) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"mock-token","token_type":"Bearer","expires_in":3600}`))
	}))
	t.Cleanup(ts.Close)

	oldTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "openidconnect.googleapis.com" {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(userinfoJSON)),
			}, nil
		}
		return oldTransport.RoundTrip(req)
	})
	t.Cleanup(func() { http.DefaultTransport = oldTransport })

	return ts
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// A Google-only user (email + oauth row, no username/password) must be able to
// set BOTH username and password via SetCredentials (Settings combined form),
// and the oauth row must survive so Google login keeps working.
func TestGoogleUser_BindUsernamePassword_KeepsGoogleLink(t *testing.T) {
	svc, db := setupAuthService(t)
	ctx := context.Background()

	// Create exactly what GoogleCallback produces for a new Google login:
	// user row with email/name/avatar, plus an oauth_accounts row.
	user, err := repositories.NewUserRepository(db).Create(ctx, &entities.User{
		Email:     "alice@gmail.com",
		Name:      "Alice",
		AvatarURL: "https://pics/pic.png",
	})
	if err != nil {
		t.Fatalf("create google user: %v", err)
	}
	oauthRepo := repositories.NewOAuthAccountRepository(db)
	if _, err := oauthRepo.Create(ctx, &entities.OAuthAccount{
		UserID:     user.ID,
		Provider:   "google",
		ProviderID: "google-sub-123",
	}); err != nil {
		t.Fatalf("create oauth row: %v", err)
	}

	// Bind username + password (the combined form path).
	if err := svc.SetCredentials(ctx, user.ID, "alice", "password123"); err != nil {
		t.Fatalf("set credentials: %v", err)
	}

	after, err := repositories.NewUserRepository(db).FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if after.Username != "alice" || after.PasswordHash == "" {
		t.Fatalf("expected username+password set, got username=%q hashSet=%v", after.Username, after.PasswordHash != "")
	}
	if after.Email != "alice@gmail.com" {
		t.Fatalf("expected email preserved, got %q", after.Email)
	}

	// Google link must still be there.
	linked, err := oauthRepo.FindByProviderID(ctx, "google", "google-sub-123")
	if err != nil || linked != user.ID {
		t.Fatalf("expected oauth row still linked to user, got %q err=%v", linked, err)
	}

	// And the user can log in with username+password now.
	if _, err := svc.Login(ctx, "alice", "password123"); err != nil {
		t.Fatalf("login with bound credentials: %v", err)
	}
}

// Google login with an email that matches an EXISTING id/pw user must
// auto-bind: link the Google account to that user instead of creating a new
// one (GoogleCallback → FindByEmail → PasswordHash != "" → auto-bind).
func TestGoogleCallback_AutoBindToExistingPasswordUser(t *testing.T) {
	ts := mockGoogleAuth(t, `{"sub":"google-sub-456","email":"bob@example.com","name":"Bob","picture":"https://pics/bob.png"}`)
	svc, db := setupAuthServiceWithOAuth(t, &configs.OAuthConfig{
		JWTSecret: testJWTSecret,
		Google: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: ts.URL,
			},
		},
	})
	ctx := context.Background()
	repo := repositories.NewUserRepository(db)

	// Existing id/pw user with email bob@example.com.
	user, err := repo.Create(ctx, &entities.User{Username: "bob", Email: "bob@example.com", Name: "Bob"})
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}
	if err := svc.SetPassword(ctx, user.ID, "password123"); err != nil {
		t.Fatalf("set password: %v", err)
	}

	// Login with Google using the same email → auto-bind.
	loginURL, err := svc.GetGoogleAuthURL()
	if err != nil {
		t.Fatalf("GetGoogleAuthURL: %v", err)
	}
	state := extractState(t, loginURL)
	tok, err := svc.GoogleCallback(ctx, "auth-code", state)
	if err != nil {
		t.Fatalf("google callback: %v", err)
	}
	if tok == nil {
		t.Fatal("expected token from auto-bind login")
	}

	// The oauth row points at the EXISTING user.
	oauthRepo := repositories.NewOAuthAccountRepository(db)
	linked, err := oauthRepo.FindByProviderID(ctx, "google", "google-sub-456")
	if err != nil || linked != user.ID {
		t.Fatalf("expected auto-bind to existing user %q, got %q err=%v", user.ID, linked, err)
	}

	// No new user was created.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 user after auto-bind, got %d", count)
	}
}

// Google login with an UNKNOWN email creates a new Google-only user (no
// username/password) — the state that Settings turns into the combined form.
func TestGoogleCallback_NewEmail_CreatesGoogleOnlyUser(t *testing.T) {
	ts := mockGoogleAuth(t, `{"sub":"google-sub-789","email":"carol@example.com","name":"Carol","picture":"https://pics/carol.png"}`)
	svc, db := setupAuthServiceWithOAuth(t, &configs.OAuthConfig{
		JWTSecret: testJWTSecret,
		Google: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: ts.URL,
			},
		},
	})
	ctx := context.Background()

	loginURL, err := svc.GetGoogleAuthURL()
	if err != nil {
		t.Fatalf("GetGoogleAuthURL: %v", err)
	}
	state := extractState(t, loginURL)
	if _, err := svc.GoogleCallback(ctx, "auth-code", state); err != nil {
		t.Fatalf("google callback: %v", err)
	}

	repo := repositories.NewUserRepository(db)
	user, err := repo.FindByEmail(ctx, "carol@example.com")
	if err != nil {
		t.Fatalf("find created user: %v", err)
	}
	// Google-only users now get a DERIVED username (email local part) so the
	// UNIQUE constraint on users.username never trips; what they still lack
	// is a password (the state Settings turns into the combined form).
	if user.Username != "carol" {
		t.Fatalf("expected derived username %q, got %q", "carol", user.Username)
	}
	if user.PasswordHash != "" {
		t.Fatal("expected no password on Google-only user")
	}
	if user.Name != "Carol" {
		t.Fatalf("expected name Carol, got %q", user.Name)
	}

	oauthRepo := repositories.NewOAuthAccountRepository(db)
	linked, err := oauthRepo.FindByProviderID(ctx, "google", "google-sub-789")
	if err != nil || linked != user.ID {
		t.Fatalf("expected oauth row for new user, got %q err=%v", linked, err)
	}
}

// Manual bind: an id/pw user clicks "Connect Google" in Settings → the bind
// mode callback links the Google account to that user.
func TestGoogleCallback_BindMode_LinksToSignedInUser(t *testing.T) {
	ts := mockGoogleAuth(t, `{"sub":"google-sub-321","email":"dave@example.com","name":"Dave","picture":"https://pics/dave.png"}`)
	svc, db := setupAuthServiceWithOAuth(t, &configs.OAuthConfig{
		JWTSecret: testJWTSecret,
		Google: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: ts.URL,
			},
		},
	})
	ctx := context.Background()
	repo := repositories.NewUserRepository(db)

	user, err := repo.Create(ctx, &entities.User{Username: "dave", Name: "Dave"})
	if err != nil {
		t.Fatalf("create dave: %v", err)
	}
	if err := svc.SetPassword(ctx, user.ID, "password123"); err != nil {
		t.Fatalf("set password: %v", err)
	}

	// Start the bind flow for this signed-in user.
	bindURL, err := svc.GetGoogleBindURL(user.ID)
	if err != nil {
		t.Fatalf("GetGoogleBindURL: %v", err)
	}
	state := extractState(t, bindURL)
	tok, err := svc.GoogleCallback(ctx, "auth-code", state)
	if err != nil {
		t.Fatalf("bind callback: %v", err)
	}
	if tok == nil {
		t.Fatal("expected token from bind callback")
	}

	oauthRepo := repositories.NewOAuthAccountRepository(db)
	linked, err := oauthRepo.FindByProviderID(ctx, "google", "google-sub-321")
	if err != nil || linked != user.ID {
		t.Fatalf("expected google linked to dave %q, got %q err=%v", user.ID, linked, err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 user after manual bind, got %d", count)
	}
}

// mockGoogleAuthSequential is mockGoogleAuth with a ROTATING userinfo payload:
// each /userinfo call returns the next JSON in the list, so one service can
// simulate multiple different Google accounts signing up.
func mockGoogleAuthSequential(t *testing.T, userinfoJSONs ...string) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"mock-token","token_type":"Bearer","expires_in":3600}`))
	}))
	t.Cleanup(ts.Close)

	var mu sync.Mutex
	idx := 0
	oldTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "openidconnect.googleapis.com" {
			mu.Lock()
			payload := userinfoJSONs[idx%len(userinfoJSONs)]
			idx++
			mu.Unlock()
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(payload)),
			}, nil
		}
		return oldTransport.RoundTrip(req)
	})
	t.Cleanup(func() { http.DefaultTransport = oldTransport })

	return ts
}

// Regression (bug hunt B1): the FIRST Google signup worked (username column
// is nullable), but a SECOND Google user with a different email inserted
// username='' → UNIQUE constraint failed: users.username → 500. Both signups
// must now succeed, each with a distinct derived username.
func TestGoogleCallback_TwoDifferentEmails_BothSignUp(t *testing.T) {
	ts := mockGoogleAuthSequential(t,
		`{"sub":"google-sub-a1","email":"alice@gmail.com","name":"Alice","picture":"https://pics/alice.png"}`,
		`{"sub":"google-sub-b2","email":"bob@gmail.com","name":"Bob","picture":"https://pics/bob.png"}`,
	)
	svc, db := setupAuthServiceWithOAuth(t, &configs.OAuthConfig{
		JWTSecret: testJWTSecret,
		Google: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: ts.URL,
			},
		},
	})
	ctx := context.Background()

	googleSignup := func() error {
		t.Helper()
		loginURL, err := svc.GetGoogleAuthURL()
		if err != nil {
			return err
		}
		state := extractState(t, loginURL)
		_, err = svc.GoogleCallback(ctx, "auth-code", state)
		return err
	}

	if err := googleSignup(); err != nil {
		t.Fatalf("first google signup: %v", err)
	}
	if err := googleSignup(); err != nil {
		t.Fatalf("second google signup: %v", err)
	}

	repo := repositories.NewUserRepository(db)
	alice, err := repo.FindByEmail(ctx, "alice@gmail.com")
	if err != nil {
		t.Fatalf("find alice: %v", err)
	}
	bob, err := repo.FindByEmail(ctx, "bob@gmail.com")
	if err != nil {
		t.Fatalf("find bob: %v", err)
	}
	if alice.Username == "" || bob.Username == "" {
		t.Fatalf("expected derived usernames for both Google users, got alice=%q bob=%q", alice.Username, bob.Username)
	}
	if alice.Username == bob.Username {
		t.Fatalf("expected distinct usernames, both got %q", alice.Username)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected exactly 2 users, got %d", count)
	}
}

package services_test

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"strings"
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
	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	svc := services.NewAuthService(
		db,
		repositories.NewUserRepository(db),
		repositories.NewOAuthAccountRepository(db),
		repositories.NewRefreshTokenRepository(db),
		&configs.OAuthConfig{
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
		},
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

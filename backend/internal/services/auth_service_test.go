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
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
	"github.com/golang-jwt/jwt/v5"
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

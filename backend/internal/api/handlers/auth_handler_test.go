package handlers_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/ardhiqii/notenext/backend/internal/api/middleware"
	"github.com/ardhiqii/notenext/backend/internal/api/routes"
	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/ardhiqii/notenext/backend/internal/services"
	"github.com/ardhiqii/notenext/backend/internal/testutil"
	"github.com/gin-gonic/gin"
)

func setupAuthRouter(t *testing.T) (*gin.Engine, *sql.DB, *services.AuthService) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := testutil.NewTestDB()
	if err != nil {
		t.Fatalf("NewTestDB: %v", err)
	}
	authService := services.NewAuthService(
		db,
		repositories.NewUserRepository(db),
		repositories.NewOAuthAccountRepository(db),
		repositories.NewRefreshTokenRepository(db),
		&configs.OAuthConfig{JWTSecret: "test-secret"},
	)
	h := handlers.NewAuthHandler(authService, "http://localhost:3000")

	r := gin.New()
	group := r.Group("/api/v1")
	routes.RegisterAuthRoutes(group, middleware.OptionalAuth(authService), h)
	return r, db, authService
}

type tokenResponse struct {
	Data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	} `json:"data"`
}

func registerViaHTTP(t *testing.T, r *gin.Engine) (tokenResponse, *httptest.ResponseRecorder) {
	t.Helper()
	body := `{"username":"alice","password":"password123","name":"Alice"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("register: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp tokenResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if resp.Data.RefreshToken == "" {
		t.Fatal("expected refresh_token in register response")
	}
	return resp, w
}

// ──────────────────────────────────────────────
// Refresh cookie attributes (bugs #2 and #3)
// ──────────────────────────────────────────────

func TestRegister_SetsRefreshCookieWithMatchingPathAndSecure(t *testing.T) {
	r, _, _ := setupAuthRouter(t)
	_, w := registerViaHTTP(t, r)

	setCookie := w.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "refresh_token=") {
		t.Fatalf("expected refresh_token cookie, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "Path=/api/v1/auth/refresh") {
		t.Fatalf("expected Path=/api/v1/auth/refresh, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "Secure") {
		t.Fatalf("expected Secure flag, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "HttpOnly") {
		t.Fatalf("expected HttpOnly flag, got %q", setCookie)
	}
}

// ──────────────────────────────────────────────
// Refresh endpoint error mapping (bug #1c)
// ──────────────────────────────────────────────

func TestRefreshAccessToken_ValidToken_Returns200(t *testing.T) {
	r, _, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: tokens.Data.RefreshToken})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode refresh response: %v", err)
	}
	if resp.Data.AccessToken == "" {
		t.Fatal("expected non-empty access_token")
	}
}

func TestRefreshAccessToken_ExpiredToken_Returns401(t *testing.T) {
	r, db, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	if _, err := db.Exec(`UPDATE refresh_tokens SET expires_at = '2020-01-01 00:00:00'`); err != nil {
		t.Fatalf("backdate token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: tokens.Data.RefreshToken})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Expired refresh token must be 401 (previously 404/500).
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRefreshAccessToken_UnknownToken_Returns401(t *testing.T) {
	r, _, _ := setupAuthRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "garbage-token"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unknown token, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRefreshAccessToken_MissingCookie_Returns401(t *testing.T) {
	r, _, _ := setupAuthRouter(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/auth/refresh", nil))

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing cookie, got %d: %s", w.Code, w.Body.String())
	}
}

// ──────────────────────────────────────────────
// Logout clears the cookie with the SAME path (bug #2/#3)
// ──────────────────────────────────────────────

func TestLogout_ClearsCookieWithMatchingPathAndSecure(t *testing.T) {
	r, _, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	setCookie := w.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "refresh_token=") {
		t.Fatalf("expected clearing cookie, got %q", setCookie)
	}
	// The clearing cookie must match the path the auth cookie was set with,
	// otherwise the browser keeps the old cookie and logout is a no-op.
	if !strings.Contains(setCookie, "Path=/api/v1/auth/refresh") {
		t.Fatalf("expected Path=/api/v1/auth/refresh on clearing cookie, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "Secure") {
		t.Fatalf("expected Secure flag on clearing cookie, got %q", setCookie)
	}
}

// ──────────────────────────────────────────────
// Changelog-seen ("What's New" popup)
// ──────────────────────────────────────────────

func TestMarkChangelogSeen_Success_Returns204AndPersists(t *testing.T) {
	r, db, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/changelog-seen",
		bytes.NewBufferString(`{"version":"1.0.0"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Repo read-back: the column must be persisted for the registered user.
	var lastSeen sql.NullString
	if err := db.QueryRow(`SELECT last_seen_changelog_version FROM users WHERE username = 'alice'`).Scan(&lastSeen); err != nil {
		t.Fatalf("query last_seen_changelog_version: %v", err)
	}
	if !lastSeen.Valid || lastSeen.String != "1.0.0" {
		t.Errorf("expected last_seen_changelog_version = %q, got valid=%v value=%q", "1.0.0", lastSeen.Valid, lastSeen.String)
	}

	// /auth/me must expose the persisted value to the FE.
	me := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
	r.ServeHTTP(me, meReq)

	if me.Code != http.StatusOK {
		t.Fatalf("expected 200 from /me, got %d: %s", me.Code, me.Body.String())
	}
	var meResp struct {
		Data struct {
			LastSeenChangelogVersion string `json:"last_seen_changelog_version"`
		} `json:"data"`
	}
	if err := json.Unmarshal(me.Body.Bytes(), &meResp); err != nil {
		t.Fatalf("decode /me response: %v", err)
	}
	if meResp.Data.LastSeenChangelogVersion != "1.0.0" {
		t.Errorf("expected /me last_seen_changelog_version = %q, got %q", "1.0.0", meResp.Data.LastSeenChangelogVersion)
	}
}

func TestMarkChangelogSeen_EmptyVersion_Returns400(t *testing.T) {
	r, db, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/changelog-seen",
		bytes.NewBufferString(`{"version":""}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Column must remain NULL — nothing persisted.
	var lastSeen sql.NullString
	if err := db.QueryRow(`SELECT last_seen_changelog_version FROM users WHERE username = 'alice'`).Scan(&lastSeen); err != nil {
		t.Fatalf("query last_seen_changelog_version: %v", err)
	}
	if lastSeen.Valid {
		t.Errorf("expected NULL last_seen_changelog_version after rejected request, got %q", lastSeen.String)
	}
}

func TestMarkChangelogSeen_MissingVersion_Returns400(t *testing.T) {
	r, _, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/changelog-seen",
		bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetMe_HasGoogleFlag(t *testing.T) {
	r, db, _ := setupAuthRouter(t)
	tokens, _ := registerViaHTTP(t, r)

	getHasGoogle := func() bool {
		t.Helper()
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.Header.Set("Authorization", "Bearer "+tokens.Data.AccessToken)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 from /me, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data struct {
				HasGoogle bool `json:"has_google"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode /me response: %v", err)
		}
		return resp.Data.HasGoogle
	}

	// A fresh username/password account has NO Google link — Settings must
	// NOT show "Connected" for it.
	if getHasGoogle() {
		t.Errorf("expected has_google=false for a fresh password user")
	}

	// After linking a Google OAuth account, /me must flip to true.
	var uid string
	if err := db.QueryRow(`SELECT id FROM users WHERE username='alice'`).Scan(&uid); err != nil {
		t.Fatalf("query user id: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO oauth_accounts (id, user_id, provider, provider_id) VALUES (?,?,?,?)`,
		"oa-test-1", uid, "google", "google-sub-1"); err != nil {
		t.Fatalf("insert oauth account: %v", err)
	}
	if !getHasGoogle() {
		t.Errorf("expected has_google=true after linking a google account")
	}
}

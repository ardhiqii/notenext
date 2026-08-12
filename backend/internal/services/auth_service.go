package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/ardhiqii/notenext/backend/internal/configs"
	"github.com/ardhiqii/notenext/backend/internal/database"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

type AuthService struct {
	db          *sql.DB
	userRepo    *repositories.UserRepository
	oauthRepo   *repositories.OAuthAccountRepository
	rTokenRepo  *repositories.RefreshTokenRepository
	oauthConfig *configs.OAuthConfig
}

type stateClaims struct {
	Verifier string `json:"verifier"`
	BindMode bool   `json:"bind_mode,omitempty"`
	jwt.RegisteredClaims
}

type AuthToken struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    int
}

// ErrBindRequiresAuth is returned by GoogleCallback in bind mode when the
// signed state token carries no user ID (i.e. the callback was reached
// without an authenticated session). Callers must map it to 401, not panic.
var ErrBindRequiresAuth = errors.New("bind requires authentication")

// ErrInvalidStateToken wraps a malformed/expired OAuth state token so the
// callback route returns a clean 400 instead of a 500.
var ErrInvalidStateToken = errors.New("invalid or expired state token")

type tokenDuration struct {
	AccessToken          time.Duration
	WebsocketToken       time.Duration
	RefreshTokenDuration time.Duration
	StateToken           time.Duration
}

var TokenDuration = tokenDuration{
	AccessToken:          15 * time.Minute,
	WebsocketToken:       30 * time.Second,
	RefreshTokenDuration: 7 * 24 * time.Hour,
	StateToken:           5 * time.Minute,
}

func NewAuthService(db *sql.DB, userRepo *repositories.UserRepository, oauthRepo *repositories.OAuthAccountRepository, rTokenRepo *repositories.RefreshTokenRepository, oauthConfig *configs.OAuthConfig) *AuthService {
	return &AuthService{
		db,
		userRepo,
		oauthRepo,
		rTokenRepo,
		oauthConfig,
	}
}

func (s *AuthService) GetMe(ctx context.Context, userID string) (*entities.User, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("AuthService.GetMe: %w", err)
	}
	return user, nil
}

// HasOAuthProvider reports whether the user has an OAuth account linked for
// the provider (used to show the real Google connection state in Settings).
func (s *AuthService) HasOAuthProvider(ctx context.Context, userID string, provider string) (bool, error) {
	return s.oauthRepo.HasProvider(ctx, userID, provider)
}

func (s *AuthService) MarkChangelogSeen(ctx context.Context, userID string, version string) error {
	if strings.TrimSpace(version) == "" {
		return errors.New("version is required")
	}
	return s.userRepo.UpdateLastSeenChangelogVersion(ctx, userID, version)
}

// ──────────────────────────────────────────────
// Username/Password Auth
// ──────────────────────────────────────────────

func (s *AuthService) Register(ctx context.Context, username, password, name string) (*AuthToken, error) {
	username = strings.TrimSpace(username)
	name = strings.TrimSpace(name)

	if username == "" || password == "" || name == "" {
		return nil, errors.New("username, password, and name are required")
	}
	if len(username) < 3 {
		return nil, errors.New("username must be at least 3 characters")
	}
	if len(username) > 50 {
		return nil, errors.New("username must be at most 50 characters")
	}
	if len(name) > 100 {
		return nil, errors.New("name must be at most 100 characters")
	}
	if len(password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}
	// bcrypt silently truncates input at 72 bytes; reject longer passwords
	// up front so the stored hash always covers the full password.
	if len(password) > 72 {
		return nil, errors.New("password must be at most 72 bytes")
	}

	// Check if username already taken
	existing, err := s.userRepo.FindByUsername(ctx, username)
	if err == nil && existing != nil {
		return nil, repositories.ErrUsernameTaken
	}
	if err != nil && !errors.Is(err, repositories.RepoErrors.NotFound) {
		return nil, fmt.Errorf("check username: %w", err)
	}

	// Hash password
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &entities.User{
		Username:     username,
		Name:         name,
		PasswordHash: string(hashed),
	}

	created, err := s.userRepo.Create(ctx, user)
	if err != nil {
		// Lost a race against a concurrent registration with the same
		// username: the UNIQUE index fired. Return the clean sentinel.
		if errors.Is(err, repositories.ErrUsernameTaken) {
			return nil, repositories.ErrUsernameTaken
		}
		return nil, fmt.Errorf("create user: %w", err)
	}

	return s.generateAuthToken(ctx, created.ID)
}

func (s *AuthService) Login(ctx context.Context, username, password string) (*AuthToken, error) {
	if username == "" || password == "" {
		return nil, errors.New("username and password are required")
	}

	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, repositories.RepoErrors.NotFound) {
			return nil, errors.New("invalid username or password")
		}
		return nil, fmt.Errorf("find user: %w", err)
	}

	if user.PasswordHash == "" {
		return nil, errors.New("this account uses Google login. Please sign in with Google, then set a password in Settings")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid username or password")
	}

	return s.generateAuthToken(ctx, user.ID)
}

func (s *AuthService) SetPassword(ctx context.Context, userID, password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	// The username/password login method must not be half-configured. A user
	// with no username cannot set a password alone — both must be set together
	// via SetCredentials (Settings shows a combined form for this state).
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("find user: %w", err)
	}
	if user.Username == "" {
		return errors.New("set a username and password together in Settings")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	return s.userRepo.UpdatePasswordHash(ctx, userID, string(hashed))
}

func (s *AuthService) SetUsername(ctx context.Context, userID, username string) error {
	username = strings.TrimSpace(username)
	if len(username) < 3 {
		return errors.New("username must be at least 3 characters")
	}
	if len(username) > 50 {
		return errors.New("username must be at most 50 characters")
	}

	// The username/password login method must not be half-configured. A user
	// with no password cannot set a username alone — both must be set together
	// via SetCredentials (Settings shows a combined form for this state).
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("find user: %w", err)
	}
	if user.PasswordHash == "" {
		return errors.New("set a username and password together in Settings")
	}

	// Check uniqueness
	existing, err := s.userRepo.FindByUsername(ctx, username)
	if err == nil && existing != nil {
		return errors.New("username already taken")
	}
	if err != nil && !errors.Is(err, repositories.RepoErrors.NotFound) {
		return fmt.Errorf("check username: %w", err)
	}

	if err := s.userRepo.UpdateUsername(ctx, userID, username); err != nil {
		// Concurrent update hit the UNIQUE index — map to the clean error.
		if errors.Is(err, repositories.ErrUsernameTaken) {
			return repositories.ErrUsernameTaken
		}
		return err
	}
	return nil
}

// SetCredentials sets username AND password together in one atomic update.
// This is the Settings "set up username & password" path: a user must not be
// able to leave the login method half-configured (username without password,
// or password without username). Validation for BOTH fields runs before any
// write, and the repo updates both columns in a single statement.
func (s *AuthService) SetCredentials(ctx context.Context, userID, username, password string) error {
	username = strings.TrimSpace(username)
	if len(username) < 3 {
		return errors.New("username must be at least 3 characters")
	}
	if len(username) > 50 {
		return errors.New("username must be at most 50 characters")
	}
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	// Check username uniqueness BEFORE hashing (fail fast, no wasted bcrypt).
	existing, err := s.userRepo.FindByUsername(ctx, username)
	if err == nil && existing != nil {
		return repositories.ErrUsernameTaken
	}
	if err != nil && !errors.Is(err, repositories.RepoErrors.NotFound) {
		return fmt.Errorf("check username: %w", err)
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.userRepo.UpdateCredentials(ctx, userID, username, string(hashed)); err != nil {
		// Concurrent update hit the UNIQUE index — map to the clean error.
		if errors.Is(err, repositories.ErrUsernameTaken) {
			return repositories.ErrUsernameTaken
		}
		return err
	}
	return nil
}

// ──────────────────────────────────────────────
// Google OAuth
// ──────────────────────────────────────────────

func (s *AuthService) GetGoogleAuthURL() (string, error) {
	verifier := oauth2.GenerateVerifier()
	state, err := s.generateStateToken(verifier, false, "")
	if err != nil {
		return "", err
	}
	url := s.oauthConfig.Google.AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verifier))
	return url, nil
}

func (s *AuthService) GetGoogleBindURL(userID string) (string, error) {
	verifier := oauth2.GenerateVerifier()
	state, err := s.generateStateToken(verifier, true, userID)
	if err != nil {
		return "", err
	}
	url := s.oauthConfig.Google.AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verifier))
	return url, nil
}

func (s *AuthService) GoogleCallback(ctx context.Context, code string, state string) (*AuthToken, error) {
	claims, err := s.validateStateToken(state)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidStateToken, err)
	}

	// Bind mode needs a signed-in session. The user ID travels inside the
	// signed state token (issued by GetGoogleBindURL from a protected route),
	// so this callback route needs no auth middleware. Fail fast with a clean
	// error instead of panicking on a nil assertion.
	if claims.BindMode && claims.Subject == "" {
		return nil, ErrBindRequiresAuth
	}

	tokenGoogle, err := s.oauthConfig.Google.Exchange(ctx, code, oauth2.VerifierOption(claims.Verifier))
	if err != nil {
		return nil, err
	}
	client := s.oauthConfig.Google.Client(ctx, tokenGoogle)
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var googleUser struct {
		ID      string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&googleUser); err != nil {
		return nil, err
	}

	// If bind mode, don't create a new user — link to existing
	if claims.BindMode {
		userID := claims.Subject
		oauthAccount := &entities.OAuthAccount{
			UserID:     userID,
			Provider:   "google",
			ProviderID: googleUser.ID,
		}
		_, err := s.oauthRepo.Create(ctx, oauthAccount)
		if err != nil {
			return nil, fmt.Errorf("bind google account: %w", err)
		}
		return s.generateAuthToken(ctx, userID)
	}

	// Normal login flow
	userId, err := s.oauthRepo.FindByProviderID(ctx, "google", googleUser.ID)
	if err != nil {
		return nil, err
	}

	if userId == "" {
		// Check if a user with this email already has a username/password account → auto-bind
		if googleUser.Email != "" {
			existingUser, err := s.userRepo.FindByEmail(ctx, googleUser.Email)
			if err == nil && existingUser != nil && existingUser.PasswordHash != "" {
				// Auto-bind: link Google to existing password user
				oauthAccount := &entities.OAuthAccount{
					UserID:     existingUser.ID,
					Provider:   "google",
					ProviderID: googleUser.ID,
				}
				_, err := s.oauthRepo.Create(ctx, oauthAccount)
				if err != nil {
					return nil, fmt.Errorf("auto-bind google to existing user: %w", err)
				}
				return s.generateAuthToken(ctx, existingUser.ID)
			}
		}

		// No existing user — create new
		err := database.WithTx(s.db, ctx, func(tx *sql.Tx) error {
			userRepoTx := repositories.NewUserRepository(tx)
			oauthRepoTx := repositories.NewOAuthAccountRepository(tx)

			user := &entities.User{
				// users.username is UNIQUE (002_add_auth_columns): inserting ''
				// for the SECOND Google user violates the index and 500s. Derive
				// a stable username from the email local part and retry with a
				// random suffix on collision (e.g. two Googles sharing a local
				// part like alice@foo.com / alice@bar.com).
				Username:  deriveUsernameFromEmail(googleUser.Email),
				Email:     googleUser.Email,
				AvatarURL: googleUser.Picture,
				Name:      googleUser.Name,
			}
			for attempt := 0; attempt < 3; attempt++ {
				user, err = userRepoTx.Create(ctx, user)
				if err == nil {
					break
				}
				if !errors.Is(err, repositories.ErrUsernameTaken) {
					return err
				}
				user.Username = user.Username + "-" + randomUsernameSuffix()
			}
			if err != nil {
				return err
			}
			oauthAccount := &entities.OAuthAccount{
				UserID:     user.ID,
				Provider:   "google",
				ProviderID: googleUser.ID,
			}
			_, err = oauthRepoTx.Create(ctx, oauthAccount)
			if err != nil {
				return err
			}
			userId = user.ID
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	return s.generateAuthToken(ctx, userId)
}

// deriveUsernameFromEmail builds a DB-safe username from the local part of an
// email (e.g. "alice.smith" from "alice.smith@gmail.com"). Google signups have
// no username form, but users.username is UNIQUE — inserting '' (as before)
// violates the index for every Google user after the first. The result is
// sanitized to letters/digits/._-, lowercased, truncated to 50 chars, and
// falls back to "user" when the local part is empty or all-invalid.
func deriveUsernameFromEmail(email string) string {
	local := email
	if idx := strings.Index(email, "@"); idx != -1 {
		local = email[:idx]
	}
	var b strings.Builder
	for _, r := range local {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '-' {
			b.WriteRune(unicode.ToLower(r))
		}
	}
	name := b.String()
	if name == "" {
		name = "user"
	}
	if len(name) > 50 {
		name = name[:50]
	}
	return name
}

// randomUsernameSuffix returns a short random hex string appended to a derived
// username when the base form is already taken (UNIQUE index collision).
func randomUsernameSuffix() string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ──────────────────────────────────────────────
// Refresh / Logout
// ──────────────────────────────────────────────

func (s *AuthService) GenerateAccessTokenWithRefreshToken(ctx context.Context, rawRefreshToken string) (string, error) {
	hash := sha256.Sum256([]byte(rawRefreshToken))
	refreshToken := hex.EncodeToString(hash[:])

	userID, err := s.rTokenRepo.FindByTokenHash(ctx, refreshToken)
	if err != nil {
		return "", fmt.Errorf("AuthService.GenerateAccessTokenWithRefreshToken.rTokenRepo.FindByTokenHash: %w", err)
	}
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("AuthService.GenerateAccessTokenWithRefreshToken.userRepo.FindByID: %w", err)
	}

	token, err := s.GenerateTokenWithUserID(user.ID, TokenDuration.AccessToken)
	if err != nil {
		return "", err
	}

	return token, nil
}

func (s *AuthService) Logout(ctx context.Context, userID string) error {
	return s.rTokenRepo.DeleteRefreshTokenByUserID(ctx, userID)
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

func (s *AuthService) generateAuthToken(ctx context.Context, userID string) (*AuthToken, error) {
	rToken, err := s.generateRefreshToken()
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256([]byte(rToken))
	rTokenHash := hex.EncodeToString(hash[:])
	refreshToken := &entities.RefreshToken{
		UserID:    userID,
		TokenHash: rTokenHash,
		// Store UTC so the stored string matches the instant the driver
		// reads back from the DATETIME column (it interprets values as UTC),
		// keeping expiry comparisons exact regardless of server timezone.
		ExpiresAt: time.Now().UTC().Add(TokenDuration.RefreshTokenDuration).Format("2006-01-02 15:04:05"),
	}
	if _, err := s.rTokenRepo.Create(ctx, refreshToken); err != nil {
		return nil, fmt.Errorf("save refresh token: %w", err)
	}

	token, err := s.GenerateTokenWithUserID(userID, TokenDuration.AccessToken)
	if err != nil {
		return nil, err
	}

	return &AuthToken{
		AccessToken:  token,
		RefreshToken: rToken,
		ExpiresAt:    int(TokenDuration.RefreshTokenDuration.Seconds()),
	}, nil
}

func (s *AuthService) generateStateToken(verifier string, bindMode bool, userID string) (string, error) {
	claims := stateClaims{
		Verifier: verifier,
		BindMode: bindMode,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenDuration.StateToken)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.oauthConfig.JWTSecret))
}

func (s *AuthService) validateStateToken(state string) (*stateClaims, error) {
	claims := &stateClaims{}
	_, err := jwt.ParseWithClaims(state, claims, func(t *jwt.Token) (any, error) {
		return []byte(s.oauthConfig.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

func (s *AuthService) GenerateTokenWithUserID(userID string, duration time.Duration) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.oauthConfig.JWTSecret))
}

func (s *AuthService) generateRefreshToken() (string, error) {
	bytes := make([]byte, 32)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *AuthService) ValidateToken(token string) (*jwt.RegisteredClaims, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method : %v", t.Header["alg"])
		}
		return []byte(s.oauthConfig.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

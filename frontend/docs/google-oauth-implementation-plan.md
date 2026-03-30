# Google OAuth — Implementation Plan

## UX Behavior

- **Guest (not logged in):** App is usable. A public note pool (max 3 notes) is shown. Notes are fetched without an auth token.
- **Logged in:** Public notes are replaced by the user's own notes. Notes are fetched with a Bearer token.
- **Login entry point:** A "Login" button sits on the right side of the tabs bar. Clicking it opens a modal.
- **Login modal:** Contains a single "Sign in with Google" button. Clicking it redirects to `GET /api/v1/auth/google`.
- **After OAuth:** Backend redirects back to `{FRONTEND_URL}#token=<access_token>`. The app parses the hash, clears it from the URL, stores the token in memory, fetches `/auth/me`, and shows the user's avatar.
- **Logged-in tabs bar:** Shows a user avatar (Google photo if available, else first letter of name). Clicking it opens a dropdown with user info + Logout.
- **Logout:** Clears in-memory token and user state. App falls back to public/guest notes.

---

## Architecture Decisions

| Concern              | Decision                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Access token storage | In-memory Zustand only (`src/hooks/use-auth.ts`) — never `localStorage`                                                                    |
| User object storage  | TanStack Query cache (`/auth/me`) with `staleTime: Infinity` — fetched once per session                                                    |
| Refresh token        | HttpOnly cookie, handled by browser. Frontend calls `/auth/refresh` via a stub interceptor. No-ops gracefully until backend implements it. |
| Token refresh hook   | Plain `async` function (not a React hook) — called inside Axios interceptor which runs outside React tree                                  |
| Query separation     | TanStack Query key includes auth token so public vs. user notes refetch on login/logout                                                    |
| Avatar fallback      | If `avatar_url` is `null`, show first letter of `name` in a styled circle                                                                  |

---

## Implementation Steps

### Step 1 — Add `User` type

File: `src/types/index.ts`

Add a `User` interface matching the `/auth/me` response:

```ts
export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
};
```

---

### Step 2 — Create auth hook

File: `src/hooks/use-auth.ts`

Same pattern as `use-modal.ts` — one file, Zustand store exported directly as the hook. Stores **only the access token** (user object lives in TanStack Query cache, not here).

```ts
import { create } from "zustand";

interface AuthStore {
  accessToken: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  accessToken: null,
  setToken: (accessToken) => set({ accessToken }),
  clearToken: () => set({ accessToken: null }),
}));
```

> No separate `src/stores/auth-store.ts` needed.

---

### Step 3 — Auth API functions

File: `src/lib/api.ts` (added below the axios instance, before interceptors)

No separate file needed — keeps things simple and avoids circular imports.

```ts
import type { User } from "@/types";

// Called during bootstrap to get user info after parsing the token from hash
export const getMe = (token: string): Promise<User> =>
  api.get("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

// Plain async function (not a hook) — called inside Axios interceptor outside the React tree
// Stub: no-ops gracefully until backend implements /auth/refresh
export const refreshAccessToken = (): Promise<{ access_token: string }> =>
  api.get("/api/v1/auth/refresh");
```

### Step 3b — AuthQueryOptions for `/auth/me`

File: `src/queries/index.ts`

User object is fetched and cached by TanStack Query, not stored in Zustand.

```ts
export const AuthQueryOptions = {
  me: (token: string | null) =>
    queryOptions({
      queryKey: ["auth", "me"],
      queryFn: () => api.get<User>("/api/v1/auth/me"),
      enabled: !!token,
      staleTime: Infinity, // fetch once per session — user profile rarely changes mid-session
      retry: false,
    }),
};
```

Used anywhere you need the user:

```ts
const { accessToken } = useAuth();
const { data: user } = useQuery(AuthQueryOptions.me(accessToken));
```

---

### Step 4 — Axios interceptors

File: `src/lib/api.ts`

Request interceptor attaches the token from `useAuth`. Response interceptor handles `401` — tries refresh, retries once, then clears token on failure.

```ts
// Request: attach token if available
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response: on 401, try refresh → retry once → clear token on failure
api.interceptors.response.use(
  (resp) => resp.data,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { access_token } = await refreshAccessToken();
        useAuth.getState().setToken(access_token);
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch {
        useAuth.getState().clearToken();
        queryClient.removeQueries({ queryKey: ["auth", "me"] });
      }
    }
    return Promise.reject(error);
  },
);
```

---

### Step 5 — Token bootstrap on app load

File: `src/routes/__root.tsx`

On mount:

1. Check `window.location.hash` for `#token=...`
2. If found → store token via `useAuth.getState().setToken()`, clear hash from URL. TanStack Query picks up the token and fetches `/auth/me` automatically (via `AuthQueryOptions.me`).
3. Else → attempt silent `refreshAccessToken()` and store new token if successful. No-ops gracefully if backend hasn't implemented it yet.

```ts
useEffect(() => {
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    const token = hash.slice(7);
    history.replaceState(null, "", window.location.pathname);
    useAuth.getState().setToken(token);
    // TanStack Query will auto-fetch /auth/me now that token is set
  } else {
    // Silent refresh attempt — fails gracefully if not implemented yet
    refreshAccessToken()
      .then(({ access_token }) => {
        useAuth.getState().setToken(access_token);
      })
      .catch(() => {
        /* guest mode — no token, public notes shown */
      });
  }
}, []);
```

---

### Step 6 — AuthQueryOptions for user data (moved to Step 3b above)

See **Step 3b**. `useAuth` is already the single hook/store from Step 2. No separate wrapper needed.

To get `isLoggedIn` and `user` anywhere in the app:

```ts
const { accessToken, clearToken } = useAuth();
const { data: user } = useQuery(AuthQueryOptions.me(accessToken));
const isLoggedIn = !!accessToken;

// Logout
const handleLogout = () => {
  clearToken();
  queryClient.removeQueries({ queryKey: ["auth", "me"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
};
```

---

### Step 7 — Login modal

File: `src/components/modals/login-modal.tsx`

A `Dialog` with a "Sign in with Google" button. On click → `window.location.href = "/api/v1/auth/google"`.

Register the `"login"` key in:

- `src/providers/modal-provider.tsx`
- `src/hooks/use-modal.ts` (union type for modal keys)

---

### Step 8 — User avatar component

File: `src/components/user-avatar.tsx`

Small circle component:

- If `avatar_url` → `<img>` with `rounded-full`
- Else → styled `div` with the first letter of `name`

```tsx
import type { User } from "@/types";

type Props = { user: User; className?: string };

export const UserAvatar = ({ user, className }: Props) => {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        className={`w-6 h-6 rounded-full object-cover ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      className={`w-6 h-6 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-medium text-white ${className ?? ""}`}
    >
      {user.name[0].toUpperCase()}
    </div>
  );
};
```

---

### Step 9 — Update `tabs-bar.tsx`

File: `src/components/tabs-bar.tsx`

Add a third control to the right-side `div` (to the left of the `+` button in JSX, which appears rightmost due to `flex-row-reverse`):

- **Logged out:** `"Login"` text button → `openModal("login")`
- **Logged in:** `UserAvatar` in a `DropdownMenu` → dropdown shows name, email, separator, and "Logout" item

```tsx
// Logged out
<button
  className="h-full flex items-center px-2 text-sm cursor-pointer hover:bg-card"
  onClick={() => openModal("login")}
>
  Login
</button>

// Logged in
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <div className="h-full flex items-center px-2 cursor-pointer hover:bg-card">
      <UserAvatar user={user} />
    </div>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <div className="px-2 py-1.5 text-sm">
      <p className="font-medium">{user.name}</p>
      <p className="text-xs text-muted-foreground">{user.email}</p>
    </div>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

### Step 10 — Wire notes queries to auth state

File: `src/hooks/note-query-options.ts`

Include `accessToken` in the note query key so TanStack Query automatically refetches when login state changes:

- When logged out → no token in key → fetches public notes (interceptor skips Authorization header)
- When logged in → token in key → fetches user notes (interceptor attaches Bearer token)

```ts
getAllNoteOnlyTitle: (accessToken: string | null) => queryOptions({
  queryKey: [...queryKeys.notes.all, { auth: !!accessToken }],
  queryFn: () => api.get("/api/v1/notes"),
}),
```

On logout, call:

```ts
queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
```

This causes notes to refetch as a guest automatically.

---

## Verification Checklist

- [ ] Open app → "Login" button visible, 3 public notes shown
- [ ] Click Login → modal appears → "Sign in with Google" → OAuth flow → redirected back → hash cleared from URL → avatar appears → user notes loaded
- [ ] Reload page → token gone (in-memory) → silent refresh fails gracefully → public notes restored (guest mode)
- [ ] Click avatar → dropdown shows name + email + Logout
- [ ] Click Logout → avatar gone → Login button back → public notes restored
- [ ] After 15-min token expiry → next API call gets 401 → interceptor tries refresh → fails gracefully → user logged out

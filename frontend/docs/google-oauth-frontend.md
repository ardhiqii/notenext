# Google OAuth — Frontend Integration Guide

## Flow Overview

```
Frontend               Backend                    Google
   |                      |                          |
   |-- GET /auth/google -->|                          |
   |                      |-- redirect to Google ---->|
   |                                                  |
   |<-------------- Google redirects to callback -----|
   |              (backend handles internally)        |
   |                                                  |
   |<-- redirect to FRONTEND_URL#token=<access_token> |
   |    (refresh_token set as HttpOnly cookie)        |
```

## Step 1 — Initiate Login

Redirect the user (or open in the same tab) to:

```
GET /api/v1/auth/google
```

No parameters needed. The backend generates a PKCE state and redirects to Google automatically.

## Step 2 — Handle the Callback Redirect

After Google login, the backend redirects the user back to your frontend at:

```
{FRONTEND_URL}#token=<access_token>
```

The fragment (`#token=...`) is **never sent to any server** — only readable by client-side JS.

Parse it like this:

```js
const hash = window.location.hash; // "#token=eyJ..."
const token = hash.startsWith("#token=") ? hash.slice(7) : null;
```

Store the access token in memory (or `sessionStorage`). **Do not store in `localStorage`** for security.

## Step 3 — Authenticated Requests

Include the access token in every authenticated API request:

```
Authorization: Bearer <access_token>
```

### Access Token Details

| Property        | Value                  |
| --------------- | ---------------------- |
| Format          | JWT (HMAC-SHA256)      |
| Expiry          | **15 minutes**         |
| Subject (`sub`) | `userID` (string UUID) |

## Step 4 — Get Current User

```
GET /api/v1/auth/me
Authorization: Bearer <access_token>
```

### Response `200 OK`

```json
{
  "id": "uuid",
  "email": "user@gmail.com",
  "name": "John Doe",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "created_at": "...",
  "updated_at": "..."
}
```

### Error Responses

| Status | Meaning                            |
| ------ | ---------------------------------- |
| `401`  | Token missing, invalid, or expired |
| `404`  | User not found                     |

## Refresh Token (Cookie)

After login, the backend sets an **HttpOnly cookie** automatically:

| Property | Value                                   |
| -------- | --------------------------------------- |
| Name     | `refresh_token`                         |
| HttpOnly | `true` (not readable by JS — by design) |
| Path     | `/api/v1/auth/refresh`                  |
| Max-Age  | 7 days                                  |
| Secure   | `false` (dev) / `true` (prod)           |

> **Note:** The `/api/v1/auth/refresh` endpoint is **not yet implemented**. When the access token expires (15 min), the user will need to re-login via `/api/v1/auth/google` for now.

## Endpoint Summary

| Method | Path                  | Auth Required | Description                |
| ------ | --------------------- | ------------- | -------------------------- |
| `GET`  | `/api/v1/auth/google` | No            | Start Google OAuth login   |
| `GET`  | `/api/v1/auth/me`     | Yes (Bearer)  | Get current logged-in user |

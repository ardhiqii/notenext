# WebSocket Integration — NoteNext

## Auth Flow

### 1. Get WS Token

Before opening any WebSocket connection, request a short-lived token (expires in 30s).

**Authenticated user:**

```
POST /auth/ws-token
Authorization: Bearer <access_token>

Response 200:
{ "websocket_token": "eyJ..." }
```

**Guest (no auth header):**

```
POST /auth/ws-token
(no Authorization header)

Response 200:
{ "websocket_token": "eyJ..." }
```

Guest token has `sub: ""` — only grants access to public notes (`user_id IS NULL`).

---

### 2. Open WebSocket Connection

Use the ws token as a query param. Token must be used **within 30 seconds**.

```
wss://api/notes/:id/ws?token=<websocket_token>
```

**Possible HTTP errors before upgrade:**
| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid/expired token |
| 404 | Note not found or not owned by user |
| 500 | Server error |

---

### 3. WebSocket Messages

**Receiving (from server):**

```json
{ "type": "client_join", "client": 2 }
{ "type": "client_leave", "client": 1 }
```

**Sending (to server):**

- Yjs CRDT binary updates → send as binary (`BinaryMessage`)
- Server broadcasts binary to all other clients in the same note room

---

### 4. Saving Content

WS does **not** persist content to DB. Call REST separately:

```
PATCH /notes/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{ "title": "My Note", "content": "<p>...</p>" }
```

Trigger this on a debounce (e.g. 2s after last Yjs update) using the rendered content from the local `Y.Doc`.

---

## Summary Flow

```
1. POST /auth/ws-token              → get websocket_token (30s expiry)
2. new WebSocket(`wss://api/notes/${id}/ws?token=${websocket_token}`)
3. Send/receive binary Yjs updates via WebSocket
4. On content change (debounced)   → PATCH /notes/:id with rendered content
```

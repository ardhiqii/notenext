package websocket

import (
	"bytes"
	"testing"
	"time"
)

func newTestHub(t *testing.T) *Hub {
	t.Helper()
	h := NewHub()
	go h.Run()
	return h
}

func registerTestClient(t *testing.T, h *Hub, noteID string) *Client {
	t.Helper()
	c := &Client{hub: h, noteId: noteID, send: make(chan []byte, 1024)}
	h.register <- c
	return c
}

func readMessage(t *testing.T, c *Client) []byte {
	t.Helper()
	select {
	case msg := <-c.send:
		return msg
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for message")
		return nil
	}
}

func expectNoMessage(t *testing.T, c *Client) {
	t.Helper()
	select {
	case msg := <-c.send:
		t.Fatalf("expected no message, got %v", msg)
	case <-time.After(200 * time.Millisecond):
	}
}

// A real Yjs sync-update message: [messageSync(0), messageYjsUpdate(2), varUint len, payload...]
func yjsUpdate(payload []byte) []byte {
	return append([]byte{0, 2, byte(len(payload))}, payload...)
}

func TestHubStoresSyncUpdatesAndReplaysThemToNewClients(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c1); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join, got %v", got)
	}
	// Fresh room with no stored updates: the client MUST still get the empty
	// SyncStep2 ack so y-websocket completes its sync handshake (regression:
	// without it the editor's "Connecting..." modal never closes and the UI
	// is locked, blocking group creation).
	if got := readMessage(t, c1); !bytes.Equal(got, emptySyncStep2) {
		t.Fatalf("expected empty SyncStep2 ack, got %v", got)
	}

	// Client 1 publishes a Yjs update; the hub relays it (echo) and stores it.
	update := yjsUpdate([]byte("abcd"))
	h.broadcast <- BroadcastMessage{noteId: noteID, message: update}
	if got := readMessage(t, c1); !bytes.Equal(got, update) {
		t.Fatalf("expected relayed update %v, got %v", update, got)
	}

	// Client 2 joins the same room later: it must receive client_join followed
	// by the stored update replayed as SyncStep2 ([0,1,...]) so its empty doc
	// converges to the room content instead of re-inserting REST content.
	c2 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c2); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c2, got %v", got)
	}
	wantReplay := []byte{0, 1, 4, 'a', 'b', 'c', 'd'}
	if got := readMessage(t, c2); !bytes.Equal(got, wantReplay) {
		t.Fatalf("expected replay %v, got %v", wantReplay, got)
	}
	expectNoMessage(t, c2)
}

func TestHubIgnoresNonUpdateMessages(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	readMessage(t, c1) // client_join

	// Awareness message (type 1) and sync-step1 (type 0, subtype 0) must be
	// relayed but NOT stored.
	h.broadcast <- BroadcastMessage{noteId: noteID, message: []byte{1, 2, 3}}
	readMessage(t, c1) // awareness echo
	h.broadcast <- BroadcastMessage{noteId: noteID, message: []byte{0, 0, 5, 1, 2, 3, 4, 5}}
	readMessage(t, c1) // step1 echo

	// A new client must get client_join + the empty SyncStep2 ack and nothing
	// else (no replay — awareness/step1 messages are never stored).
	c2 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c2); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c2, got %v", got)
	}
	if got := readMessage(t, c2); !bytes.Equal(got, emptySyncStep2) {
		t.Fatalf("expected empty SyncStep2 ack for c2, got %v", got)
	}
	expectNoMessage(t, c2)
}

func TestHubKeepsRoomsIsolated(t *testing.T) {
	h := newTestHub(t)

	cA := registerTestClient(t, h, "note-A")
	readMessage(t, cA) // client_join
	readMessage(t, cA) // empty SyncStep2 ack
	updateA := yjsUpdate([]byte("AAAA"))
	h.broadcast <- BroadcastMessage{noteId: "note-A", message: updateA}
	readMessage(t, cA) // echo

	// A room-B client must never see note-A's stored update.
	cB := registerTestClient(t, h, "note-B")
	if got := readMessage(t, cB); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for cB, got %v", got)
	}
	readMessage(t, cB) // empty SyncStep2 ack
	expectNoMessage(t, cB)
}

func TestHubReplayOrderMatchesArrival(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	readMessage(t, c1) // client_join
	readMessage(t, c1) // empty SyncStep2 ack

	updates := [][]byte{
		yjsUpdate([]byte("aaaa")),
		yjsUpdate([]byte("bbbb")),
		yjsUpdate([]byte("cccc")),
	}
	for _, u := range updates {
		h.broadcast <- BroadcastMessage{noteId: noteID, message: u}
		readMessage(t, c1) // echo
	}

	c2 := registerTestClient(t, h, noteID)
	readMessage(t, c2) // client_join
	for i, u := range updates {
		want := append([]byte{0, 1}, u[2:]...) // same payload, subtype swapped 2 -> 1
		if got := readMessage(t, c2); !bytes.Equal(got, want) {
			t.Fatalf("replay %d: expected %v, got %v", i, want, got)
		}
	}
	expectNoMessage(t, c2)
}

func TestHubOverflowClearsStoreToAvoidPartialReplay(t *testing.T) {
	old := maxStoredUpdatesPerRoom
	maxStoredUpdatesPerRoom = 3
	defer func() { maxStoredUpdatesPerRoom = old }()

	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	readMessage(t, c1) // client_join
	readMessage(t, c1) // empty SyncStep2 ack

	// Push 4 updates through with a cap of 3: the store is cleared on
	// overflow and re-seeded with only the newest update, so a fresh client
	// never receives a partial prefix it cannot converge from.
	for i := 0; i < 4; i++ {
		h.broadcast <- BroadcastMessage{noteId: noteID, message: yjsUpdate([]byte{byte('a' + i)})}
		readMessage(t, c1) // echo
	}

	c2 := registerTestClient(t, h, noteID)
	readMessage(t, c2)           // client_join
	want := []byte{0, 1, 1, 'd'} // only the newest update survives the overflow
	if got := readMessage(t, c2); !bytes.Equal(got, want) {
		t.Fatalf("expected newest-only replay %v, got %v", want, got)
	}
	expectNoMessage(t, c2)
}

// waitForRoomEmpty synchronizes with Hub.Run: the hub processes messages
// strictly in the order the test enqueues them (each send to an unbuffered
// channel blocks until received), and the receive of c3's client_join below
// establishes a happens-before edge for the map state cleaned up earlier.
func TestHubReleasesRoomStateWhenLastClientUnregisters(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	readMessage(t, c1) // client_join
	readMessage(t, c1) // empty SyncStep2 ack (fresh room)
	c2 := registerTestClient(t, h, noteID)
	readMessage(t, c1)     // client_join (c2 arrived)
	readMessage(t, c2)     // client_join
	readMessage(t, c2)     // empty SyncStep2 ack (fresh room)
	expectNoMessage(t, c2) // nothing stored yet → no replay

	// Store an update so the replay store is non-empty for this room.
	update := yjsUpdate([]byte("leak-check"))
	h.broadcast <- BroadcastMessage{noteId: noteID, message: update}
	readMessage(t, c1) // echo
	readMessage(t, c2) // echo

	// Both clients leave → room becomes empty. Each blocking send is
	// processed by the hub in order, before the register below.
	h.unregister <- c1
	h.unregister <- c2

	// Registering c3 and receiving its join proves the hub has fully
	// processed both unregisters (and the cleanup they trigger).
	c3 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c3); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c3, got %v", got)
	}

	// The replay store must be gone: no leak of the old room's updates.
	if _, ok := h.documents[noteID]; ok {
		t.Fatalf("replay store for room %q was not released after it emptied", noteID)
	}
	// The room map must contain only the fresh client — not a stale
	// accumulation of c1/c2 entries.
	if room := h.rooms[noteID]; len(room) != 1 {
		t.Fatalf("expected room %q to contain only c3, got %d clients", noteID, len(room))
	}

	// A fresh client in the same room must NOT receive a replay of the old
	// update — it starts fresh and is repopulated via REST content insert.
	// It still gets the empty SyncStep2 handshake ack.
	readMessage(t, c3) // empty SyncStep2 ack
	expectNoMessage(t, c3)
}

func TestHubRelaysGuestUpdates(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	// signed-in client (userID set) + guest client (userID "")
	user := &Client{hub: h, noteId: noteID, send: make(chan []byte, 1024), userID: "u1"}
	h.register <- user
	if got := readMessage(t, user); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join, got %v", got)
	}
	readMessage(t, user) // empty SyncStep2 ack (fresh room)
	guest := &Client{hub: h, noteId: noteID, send: make(chan []byte, 1024), userID: ""}
	h.register <- guest
	if got := readMessage(t, guest); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for guest, got %v", got)
	}
	readMessage(t, guest) // empty SyncStep2 ack (fresh room)
	readMessage(t, user)  // client_join (guest arrived)

	// A signed-in client's update is relayed to everyone (echo + guest view).
	update := yjsUpdate([]byte("from-user"))
	h.broadcast <- BroadcastMessage{noteId: noteID, message: update}
	if got := readMessage(t, user); !bytes.Equal(got, update) {
		t.Fatalf("expected signed-in update echoed %v, got %v", update, got)
	}
	if got := readMessage(t, guest); !bytes.Equal(got, update) {
		t.Fatalf("expected signed-in update relayed to guest %v, got %v", update, got)
	}

	// A GUEST-originated update (public notes are editable by guests — the
	// handshake already restricted this guest to a public room) must be
	// relayed to the signed-in client too, and stored for replay.
	guestUpdate := yjsUpdate([]byte("guest-inject"))
	h.broadcast <- BroadcastMessage{noteId: noteID, message: guestUpdate}
	if got := readMessage(t, guest); !bytes.Equal(got, guestUpdate) {
		t.Fatalf("expected guest update echoed to itself %v, got %v", guestUpdate, got)
	}
	if got := readMessage(t, user); !bytes.Equal(got, guestUpdate) {
		t.Fatalf("expected guest update relayed to signed-in user %v, got %v", guestUpdate, got)
	}

	// ...and STORED: a fresh client must get client_join + BOTH the signed-in
	// update and the guest update replayed.
	c2 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c2); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c2, got %v", got)
	}
	wantReplayUser := []byte{0, 1, 9, 'f', 'r', 'o', 'm', '-', 'u', 's', 'e', 'r'}
	if got := readMessage(t, c2); !bytes.Equal(got, wantReplayUser) {
		t.Fatalf("expected signed-in replay %v, got %v", wantReplayUser, got)
	}
	wantReplayGuest := []byte{0, 1, 12, 'g', 'u', 'e', 's', 't', '-', 'i', 'n', 'j', 'e', 'c', 't'}
	if got := readMessage(t, c2); !bytes.Equal(got, wantReplayGuest) {
		t.Fatalf("expected guest replay %v, got %v", wantReplayGuest, got)
	}
	expectNoMessage(t, c2)
}

func TestHubDoesNotBlockOnFullClientBuffer(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	// A "stuck" client: tiny send buffer that is never drained by a reader.
	stuck := &Client{hub: h, noteId: noteID, send: make(chan []byte, 1)}
	h.register <- stuck
	// The join notification fills the stuck client's buffer immediately.

	// A healthy client must still be able to register in the same room: the
	// hub has to drop (not block on) the notification to the stuck client.
	healthy := registerTestClient(t, h, noteID)
	if got := readMessage(t, healthy); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for healthy client, got %v", got)
	}
	readMessage(t, healthy) // empty SyncStep2 ack (fresh room)

	// Unregistering the stuck client must also not block: the leave
	// notification to the remaining (healthy) client is delivered.
	h.unregister <- stuck
	if got := readMessage(t, healthy); !bytes.Contains(got, []byte("client_leave")) {
		t.Fatalf("expected client_leave for healthy client, got %v", got)
	}

	// And the hub keeps working for further traffic.
	h.broadcast <- BroadcastMessage{noteId: noteID, message: yjsUpdate([]byte("still-alive"))}
	if got := readMessage(t, healthy); !bytes.Equal(got, yjsUpdate([]byte("still-alive"))) {
		t.Fatalf("expected broadcast to be relayed, got %v", got)
	}
}

func TestHubDroppedSlowClientReleasesRoomState(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	// A stuck client is the ONLY client in the room: tiny buffer that is
	// NEVER drained. The client_join notification fills the buffer, the
	// SyncStep2 ack gets dropped ("buffer full"), and the buffer stays full
	// so the next broadcast makes the hub drop the client entirely.
	stuck := &Client{hub: h, noteId: noteID, send: make(chan []byte, 1)}
	h.register <- stuck

	// Broadcast while the client's buffer is full → the hub drops it. The
	// message is a sync update so storeUpdate fills the replay store first —
	// the drop-path cleanup must release BOTH room and document.
	h.broadcast <- BroadcastMessage{noteId: noteID, message: yjsUpdate([]byte("drop-me"))}

	// Barrier: registering c3 and receiving its join proves the hub has
	// fully processed the broadcast (channel order is FIFO). This mirrors
	// TestHubReleasesRoomStateWhenLastClientUnregisters and avoids reading
	// the maps concurrently with the hub goroutine (race detector).
	c3 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c3); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c3, got %v", got)
	}

	// The drop path used to leak both maps when a slow client was dropped
	// as the last one in the room. After the barrier, the room must contain
	// only the fresh c3 (stuck was removed) and the replay store must be gone.
	if room := h.rooms[noteID]; len(room) != 1 {
		t.Fatalf("expected room %q to contain only c3 after slow-client drop, got %d clients", noteID, len(room))
	}
	if _, ok := h.documents[noteID]; ok {
		t.Fatal("expected replay store to be released after slow client drop")
	}
}

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

	// A new client must get client_join and nothing else (no replay).
	c2 := registerTestClient(t, h, noteID)
	if got := readMessage(t, c2); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for c2, got %v", got)
	}
	expectNoMessage(t, c2)
}

func TestHubKeepsRoomsIsolated(t *testing.T) {
	h := newTestHub(t)

	cA := registerTestClient(t, h, "note-A")
	readMessage(t, cA)
	updateA := yjsUpdate([]byte("AAAA"))
	h.broadcast <- BroadcastMessage{noteId: "note-A", message: updateA}
	readMessage(t, cA) // echo

	// A room-B client must never see note-A's stored update.
	cB := registerTestClient(t, h, "note-B")
	if got := readMessage(t, cB); !bytes.Contains(got, []byte("client_join")) {
		t.Fatalf("expected client_join for cB, got %v", got)
	}
	expectNoMessage(t, cB)
}

func TestHubReplayOrderMatchesArrival(t *testing.T) {
	h := newTestHub(t)
	noteID := "note-1"

	c1 := registerTestClient(t, h, noteID)
	readMessage(t, c1)

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
	readMessage(t, c1)

	// Push 4 updates through with a cap of 3: the store is cleared on
	// overflow and re-seeded with only the newest update, so a fresh client
	// never receives a partial prefix it cannot converge from.
	for i := 0; i < 4; i++ {
		h.broadcast <- BroadcastMessage{noteId: noteID, message: yjsUpdate([]byte{byte('a' + i)})}
		readMessage(t, c1) // echo
	}

	c2 := registerTestClient(t, h, noteID)
	readMessage(t, c2) // client_join
	want := []byte{0, 1, 1, 'd'} // only the newest update survives the overflow
	if got := readMessage(t, c2); !bytes.Equal(got, want) {
		t.Fatalf("expected newest-only replay %v, got %v", want, got)
	}
	expectNoMessage(t, c2)
}

package websocket

import (
	"fmt"

	"github.com/rs/zerolog/log"
)

// Yjs binary protocol message types (see y-protocols/sync.js):
//
//	messageSync          = 0  (first byte of every sync message)
//	messageYjsSyncStep1  = 0  (client asks for the room state)
//	messageYjsSyncStep2  = 1  (response carrying state updates)
//	messageYjsUpdate     = 2  (incremental update from a client)
//
// An update message looks like [0, 2, varUint(len), payload...]. Replaying a
// stored update to a new client as SyncStep2 only requires swapping the second
// byte (2 -> 1) — the payload and length stay identical.
const (
	messageSync      = 0
	messageYjsStep2  = 1
	messageYjsUpdate = 2
)

// maxStoredUpdatesPerRoom bounds how many Yjs updates the hub keeps per room.
// Exceeding it clears the store so a fresh client never receives a partial
// prefix it cannot converge from (it falls back to REST population instead).
var maxStoredUpdatesPerRoom = 5000

type BroadcastMessage struct {
	noteId  string
	message []byte
}

type YDocument struct {
	updates [][]byte // full update messages ([0,2,...]) in arrival order
	bytes   int      // total payload bytes (rough memory bound)
}

type Hub struct {
	rooms      map[string]map[*Client]bool
	documents  map[string]*YDocument
	broadcast  chan BroadcastMessage
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan BroadcastMessage),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		rooms:      make(map[string]map[*Client]bool),
		documents:  make(map[string]*YDocument),
	}
}

// isSyncUpdate reports whether msg is a Yjs incremental update message
// ([0, 2, ...]) — the only kind that must be stored for replay.
func isSyncUpdate(msg []byte) bool {
	return len(msg) >= 3 && msg[0] == messageSync && msg[1] == messageYjsUpdate
}

// storeUpdate appends a Yjs update message to the room's document so later
// clients can converge to the current content instead of starting empty.
// Must only be called from Hub.Run (single writer).
func (h *Hub) storeUpdate(noteId string, msg []byte) {
	doc := h.documents[noteId]
	if doc == nil {
		doc = &YDocument{}
		h.documents[noteId] = doc
	}
	if len(doc.updates) >= maxStoredUpdatesPerRoom {
		// Never replay a partial state: drop everything so the first client
		// in the next session repopulates from REST (FE guard: clientsRef<=1).
		doc.updates = nil
		doc.bytes = 0
	}
	doc.updates = append(doc.updates, msg)
	doc.bytes += len(msg)
}

// replayUpdates sends every stored Yjs update of the room to the client as a
// SyncStep2 message ([0,1,...]), so its empty doc converges without needing a
// peer and without re-inserting REST content. Non-blocking: if the client's
// send buffer fills (very large sessions), we stop instead of stalling the hub.
// Must only be called from Hub.Run (single writer) — the client cannot be
// unregistered while we are inside the register case.
func (h *Hub) replayUpdates(client *Client) {
	doc := h.documents[client.noteId]
	if doc == nil {
		return
	}
	for _, update := range doc.updates {
		replay := append([]byte(nil), update...)
		replay[1] = messageYjsStep2
		select {
		case client.send <- replay:
		default:
			// Buffer full — the client will converge via peers or REST.
			log.Warn().
				Str("noteID", client.noteId).
				Msg("dropping replayed Yjs updates: client buffer full")
			return
		}
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			if h.rooms[client.noteId] == nil {
				h.rooms[client.noteId] = make(map[*Client]bool)
			}
			h.rooms[client.noteId][client] = true
			// Presence notification. Non-blocking: a client whose send buffer is
			// full must never stall the hub for every other room — the join/leave
			// count is a hint only, peers converge via Yjs updates / REST.
			joinMsg := []byte(fmt.Sprintf(`{"type":"client_join","client":%d}`, len(h.rooms[client.noteId])))
			for c := range h.rooms[client.noteId] {
				select {
				case c.send <- joinMsg:
				default:
					log.Debug().
						Str("noteID", c.noteId).
						Msg("dropping client_join notification: client buffer full")
				}
			}

			log.Info().
				Str("noteID", client.noteId).
				Int("clients_in_room", len(h.rooms[client.noteId])).
				Msg("Client joined room")

			// Replay stored updates so the new client converges to the room's
			// content instead of seeing an empty doc (which triggered the
			// REST re-insert duplication bug).
			h.replayUpdates(client)
		case client := <-h.unregister:
			if room, ok := h.rooms[client.noteId]; ok {
				if _, ok := room[client]; ok {
					delete(room, client)
					close(client.send)
					if len(room) == 1 {
						// Non-blocking: a stuck peer must not stall the hub.
						leaveMsg := []byte(fmt.Sprintf(`{"type":"client_leave","client":%d}`, len(h.rooms[client.noteId])))
						for c := range room {
							select {
							case c.send <- leaveMsg:
							default:
								log.Debug().
									Str("noteID", c.noteId).
									Msg("dropping client_leave notification: client buffer full")
							}
						}
					}
					if len(room) == 0 {
						delete(h.rooms, client.noteId)
						// Release the per-room replay store too: without this the
						// Yjs update history of every note ever opened leaks for
						// the lifetime of the hub process. A later client starts
						// fresh — its doc is repopulated via REST content insert.
						delete(h.documents, client.noteId)
						log.Info().Str("noteID", client.noteId).Msg("Room closed")
					} else {
						log.Info().
							Str("noteID", client.noteId).
							Int("clients_in_room", len(room)).
							Msg("Client left room")
					}
				}
			}
		case message := <-h.broadcast:
			// Store Yjs incremental updates so later joiners can replay them.
			if isSyncUpdate(message.message) {
				h.storeUpdate(message.noteId, message.message)
			}
			room, ok := h.rooms[message.noteId]
			if !ok {
				continue
			}
			for client := range room {
				select {
				case client.send <- message.message:
				default:
					close(client.send)
					delete(room, client)
				}
			}
		}
	}
}

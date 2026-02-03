package websocket

import "github.com/rs/zerolog/log"

type BroadcastMessage struct {
	noteId  string
	message []byte
}

type Hub struct {
	rooms      map[string]map[*Client]bool
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

			log.Info().
				Str("noteID", client.noteId).
				Int("clients_in_room", len(h.rooms[client.noteId])).
				Msg("Client joined room")
		case client := <-h.unregister:
			if room, ok := h.rooms[client.noteId]; ok {
				if _, ok := room[client]; ok {
					delete(room, client)
					close(client.send)
					if len(room) == 0 {
						delete(h.rooms, client.noteId)
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

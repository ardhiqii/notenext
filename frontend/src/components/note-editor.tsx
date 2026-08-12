import { useNotes } from "@/hooks/use-notes";
import type { Note } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useEditorSettings } from "@/hooks/use-editor-settings";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import { useModal } from "@/hooks/use-modal";
import * as random from "lib0/random";
import { getWebSocketBaseUrl } from "@/lib/utils";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, basicSetup } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { EditorState, Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { queryClient } from "@/lib/query-client";
import { AuthQueryOptions } from "@/queries/auth-query-options";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { toast } from "sonner";
import axios from "axios";

interface NoteEditorProps {
  currentNote: Note;
}

const CURSOR_COLORS = [
  { color: "#30bced" },
  { color: "#6eeb83" },
  { color: "#ffbc42" },
  { color: "#ecd444" },
  { color: "#ee6352" },
  { color: "#9ac2c9" },
  { color: "#8acb88" },
  { color: "#1be7ff" },
];
const USER_COLOR = CURSOR_COLORS[random.uint32() % CURSOR_COLORS.length];

const WS_BASE_URL = getWebSocketBaseUrl();

// After this many consecutive WebSocket failures (404 from a deleted note,
// dead ticket, hub down...) we stop the reconnect loop entirely and verify
// the note's existence over REST instead of hammering the ws endpoint
// forever. Tickets are refreshed on the first few failures since they only
// live ~30s — but the loop must terminate.
const MAX_CONSECUTIVE_FAILURES = 5;

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const { openModal, closeModal } = useModal();

  const { updateContentNote, dropStaleNote } = useNotes();

  // Public/global notes (Welcome, Getting Started, Hey) are shared content —
  // editable by ANYONE, including guests (no login required), so anonymous
  // visitors can try the app. Read-only treatment applies only to tab
  // management in the strip (close/rename/drag), not to content.

  const clientsRef = useRef(0);
  const debounceUpdate = useDebouncedCallback((updatedNote: Note) => {
    if (!currentNote) return;
    if (clientsRef.current == 1) {
      updateContentNote(updatedNote);
    }
  }, 300);
  const [_, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const wrapCompartment = useRef(new Compartment());

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    return useEditorSettings.subscribe((s) => {
      if (!viewRef.current) return;
      viewRef.current.dispatch({
        effects: wrapCompartment.current.reconfigure(
          s.wordWrap ? EditorView.lineWrapping : [],
        ),
      });
    });
  }, []);

  useEffect(() => {
    // Guard FIRST: if there is no note (or the editor ref isn't mounted yet)
    // bail out before opening the modal — otherwise a guard-hit would leave
    // the non-dismissible "Connecting..." modal stuck open, locking the UI.
    if (!currentNote || !editorRef.current) return;

    openModal("connection-note");
    setConnectionStatus("connecting");

    let cancelled = false;
    // Set when the note is confirmed deleted on the server (404 over REST):
    // used to skip the save-on-unmount PATCH for a note that no longer exists.
    let noteDeletedRemotely = false;
    // Set only when the Yjs doc actually received/contained the note's real
    // content (sync event fired, REST content populated, or a client_leave
    // confirmed us as last client). If the WS never synced (hub down, dead
    // ticket) ytext stays EMPTY and the unmount-save PATCH would WIPE the
    // note's content in the DB — so we must not save in that case.
    let everSynced = false;
    // Hard fallback: if the WS never reaches sync (e.g. the hub restarted
    // and the room has no stored updates, or the ticket expired and every
    // reconnect fails), the "Connecting..." modal must still close — a
    // permanently-open non-dismissible modal locks the WHOLE UI, including
    // group creation. 10s is generous: normal sync completes in <1s.
    const modalFallback = window.setTimeout(() => {
      if (cancelled) return;
      closeModal();
    }, 10_000);

    let ydoc: Y.Doc | null = null;
    let ytext: Y.Text | null = null;
    let wsProvider: WebsocketProvider | null = null;
    let awareness: Awareness | null = null;
    let view: EditorView | null = null;
    let messageHandler: ((e: MessageEvent) => void) | null = null;
    let handleTypeDocChange: (() => void) | null = null;

    // Idempotent full teardown: closes the WS, destroys the Yjs doc and the
    // editor view, and removes listeners. Must be safe to call at ANY point —
    // including BEFORE the async init finished (nulls are no-ops) and from
    // the cancelled path (StrictMode double-mount in dev). The old code only
    // destroyed the view on cancel and leaked the WebSocket + Yjs doc, leaving
    // a live-but-abandoned "zombie" client in the room. The zombie kept the
    // client count >= 2 forever, which blanked the editor (populate guard
    // skipped) and, with the old ytext-only guard, made EVERY client insert
    // the full REST content — the 8x note duplication bug.
    const teardown = () => {
      window.clearTimeout(modalFallback);
      if (wsProvider && messageHandler) {
        wsProvider.ws?.removeEventListener("message", messageHandler);
      }
      if (ytext && handleTypeDocChange) {
        ytext.unobserve(handleTypeDocChange);
      }
      awareness?.setLocalState(null);
      wsProvider?.disconnect();
      wsProvider?.destroy();
      ydoc?.destroy();
      view?.destroy();
      viewRef.current = null;
      wsProvider = null;
      ydoc = null;
      ytext = null;
      awareness = null;
      view = null;
      messageHandler = null;
      handleTypeDocChange = null;
    };

    const initCollaboration = async () => {
      const resp = await queryClient.fetchQuery(AuthQueryOptions.getWsTicket);
      const ticket = resp.ws_ticket;

      ydoc = new Y.Doc();
      ytext = ydoc.getText("codemirror");
      wsProvider = new WebsocketProvider(
        WS_BASE_URL,
        `${currentNote.id}/ws?ticket=${ticket}`,
        ydoc,
      );

      // Reconnect resilience — the BE issues a SHORT-LIVED ws ticket (30s)
      // used to auth the Yjs websocket. If the connection drops (server
      // restart, network blip) after the ticket expired, y-websocket's
      // built-in reconnect keeps retrying the ORIGINAL URL with the dead
      // ticket → every retry fails → collaboration is dead until page reload.
      // On every 'connection-close' we fetch a FRESH ticket and swap it into
      // the provider's room URL. The `url` getter re-reads `roomname` on each
      // connection attempt, so the next automatic backoff retry (or the
      // connect() we kick off below) uses the fresh ticket. Purely additive:
      // the Y.Doc/provider are NEVER recreated (that would risk the
      // duplication bug) and the automatic reconnect loop is left intact.
      // The listener is auto-removed by wsProvider.destroy() in teardown().
      let refreshingTicket = false;
      let consecutiveFailures = 0;
      let reconnectStopped = false;

      // Give up on the WebSocket and verify the note's existence over REST.
      // Called once, after MAX_CONSECUTIVE_FAILURES — never in a loop.
      const verifyNoteAfterWsFailure = async () => {
        try {
          await queryClient.fetchQuery(
            NoteQueryOptions.getCurrentNoteById(currentNote.id),
          );
          if (cancelled) return;
          // The note still exists — the server/network is down. Stay
          // disconnected (no more reconnects, no hammering) and ask the
          // user to reload once connectivity is back.
          toast.error("Koneksi real-time terputus. Muat ulang untuk mencoba lagi.");
        } catch (error) {
          if (cancelled) return;
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            // The note was deleted on the server. Drop the stale tab
            // LOCALLY — a DELETE here would 404 and the mutation's rollback
            // would resurrect the ghost tab.
            noteDeletedRemotely = true;
            toast("Note telah dihapus di perangkat lain.");
            dropStaleNote(currentNote.id);
          } else {
            // Unreachable server or unknown error — same treatment as a
            // successful fetch: stop retrying, ask for a reload.
            toast.error("Koneksi real-time terputus. Muat ulang untuk mencoba lagi.");
          }
        }
      };

      const onConnectionClose = () => {
        if (cancelled || !wsProvider || reconnectStopped) return;
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Stop the loop for good: disconnect() sets shouldConnect=false,
          // so y-websocket's own backoff timer stops scheduling attempts.
          reconnectStopped = true;
          wsProvider.disconnect();
          void verifyNoteAfterWsFailure();
          return;
        }
        if (refreshingTicket) return;
        refreshingTicket = true;
        queryClient
          .fetchQuery(AuthQueryOptions.getWsTicket)
          .then((resp) => {
            if (cancelled || !wsProvider || reconnectStopped) return;
            wsProvider.roomname = `${currentNote.id}/ws?ticket=${resp.ws_ticket}`;
            // Kick an immediate reconnect with the fresh ticket. No-op if a
            // retry is already in flight — that one fails, and the next
            // backoff attempt picks up the fresh URL automatically.
            wsProvider.connect();
          })
          .catch(() => {
            // Ticket refresh failed — leave the provider alone; y-websocket
            // keeps retrying and the next 'connection-close' retries this.
          })
          .finally(() => {
            refreshingTicket = false;
          });
      };
      wsProvider.on("connection-close", onConnectionClose);
      // A successful open means the failures were transient — reset the
      // counter so a later drop still gets the full budget of retries.
      // Also re-attach the raw message listener: y-websocket creates a NEW
      // WebSocket object on every reconnect, so a one-time attach to the
      // first `ws` silently stops receiving client_join/client_leave after
      // the first reconnect — freezing clientsRef and killing autosave.
      wsProvider.on("status", ({ status }: { status: string }) => {
        if (status === "connected") {
          consecutiveFailures = 0;
          if (wsProvider && messageHandler) {
            wsProvider.ws?.removeEventListener("message", messageHandler);
            wsProvider.ws?.addEventListener("message", messageHandler);
          }
        }
      });

      const undoManager = new Y.UndoManager(ytext);
      awareness = wsProvider.awareness;
      awareness.setLocalStateField("user", {
        name: "Client - " + ydoc.clientID,
        color: USER_COLOR.color,
      });

      const state = EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          // Editor is always editable — public notes are shared content
          // open to everyone, including guests.
          yCollab(ytext, awareness, { undoManager }),
          wrapCompartment.current.of(
            useEditorSettings.getState().wordWrap
              ? EditorView.lineWrapping
              : [],
          ),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { height: "100%" },
          }),
        ],
      });

      view = new EditorView({ state, parent: editorRef.current! });
      if (cancelled) {
        // StrictMode double-mount (dev): this instance was already torn down.
        // Close the WS + doc so we don't leave a zombie client in the room.
        teardown();
        return;
      }
      viewRef.current = view;

      handleTypeDocChange = () => {
        debounceUpdate({ ...currentNote, content: ytext!.toString() });
      };

      ytext.observe(handleTypeDocChange);

      // Populate the Yjs doc from REST content ONLY when we are the first
      // (or only) client in the room AND the doc is still empty. With the
      // hub's server-side update replay, a doc that has content on the
      // server arrives populated — inserting here then would duplicate the
      // whole note (the 8x duplication bug: every concurrent client inserted
      // the full REST content into its own empty doc and Yjs merged them).
      const populateIfEmpty = () => {
        if (
          ytext!.toString().length === 0 &&
          currentNote.content &&
          clientsRef.current <= 1
        ) {
          ydoc!.transact(() => {
            ytext!.insert(0, currentNote.content);
          });
        }
        everSynced = true;
      };

      messageHandler = (e: MessageEvent) => {
        const decoder = new TextDecoder("utf-8");
        const decodedString = decoder.decode(e.data);
        try {
          const jsonData = JSON.parse(decodedString);
          if (jsonData.type == "client_join") {
            clientsRef.current = jsonData.client;
          }
          if (jsonData.type === "client_leave") {
            clientsRef.current = jsonData.client;
            if (jsonData.client == 1) {
              // We are the last client left. If the doc is still empty (we
              // skipped population earlier because a stale/overlapping
              // client inflated the count), populate now — otherwise the
              // editor stays blank forever.
              populateIfEmpty();
              everSynced = true;
              debounceUpdate({ ...currentNote, content: ytext!.toString() });
            }
          }
        } catch (error) {}
      };

      wsProvider.ws?.addEventListener("message", messageHandler);
      wsProvider.once("sync", (isSynced) => {
        if (!isSynced) return;
        // Populate Yjs from REST API content if Yjs doc is empty.
        // This avoids the race condition where clientsRef.current is wrong
        // due to async hub unregister when switching tabs rapidly.
        populateIfEmpty();
        everSynced = true;
        window.clearTimeout(modalFallback);
        closeModal();
      });
      // wsProvider.on("status", ({ status }) => {
      //   setConnectionStatus(status);
      //   if (status === "disconnected" && wsProvider.shouldConnect) {
      //     window.location.reload();
      //   }
      // });
    };

    initCollaboration().catch(() => closeModal());

    return () => {
      cancelled = true;
      // Save the doc if it changed — only on a REAL unmount. The cancelled
      // path (StrictMode) skips this so an empty zombie doc never wipes a note.
      // Also skipped when the note was confirmed deleted on the server: a
      // PATCH to a deleted note would 404 for nothing. And skipped when the
      // WS never synced (hub down, dead ticket): ytext is still EMPTY and
      // saving would WIPE the note's real content from the DB.
      if (
        ytext &&
        !noteDeletedRemotely &&
        everSynced &&
        currentNote.content !== ytext.toString()
      ) {
        updateContentNote({ ...currentNote, content: ytext.toString() });
      }
      teardown();
      closeModal();
    };
  }, [currentNote.id]);

  return <div ref={editorRef} className="h-full"></div>;
};

export default NoteEditor;

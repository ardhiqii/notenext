import { useNotes } from "@/hooks/use-notes";
import type { Note } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useModal } from "@/hooks/use-modal";
import * as random from "lib0/random";
import { getWebSocketBaseUrl } from "@/lib/utils";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, basicSetup } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

interface NoteEditorProps {
  currentNote: Note | null;
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

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const { openModal, closeModal } = useModal();
  const { updateContentNote } = useNotes();

  const [clients, setClients] = useState(0);

  const debounceUpdate = useDebouncedCallback((updatedNote: Note) => {
    if (!currentNote) return;
    if (clients == 1) {
      updateContentNote(updatedNote);
    }
  }, 300);
  const [_, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);


  useEffect(() => {
    openModal("connection-note");
    if (!currentNote || !editorRef.current) {
      return;
    }
    setConnectionStatus("connecting");

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("codemirror");
    const wsProvider = new WebsocketProvider(
      WS_BASE_URL,
      `${currentNote.id}/ws`,
      ydoc,
    );
    const undoManager = new Y.UndoManager(ytext);
    const awareness = wsProvider.awareness;
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
        yCollab(ytext, awareness, { undoManager }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { height: "100%" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    const handleTypeDocChange = () => {
      debounceUpdate({ ...currentNote, content: ytext.toString() });
    };

    ytext.observe(handleTypeDocChange);

    const messageHandler = (e: MessageEvent) => {
      const decoder = new TextDecoder("utf-8");
      const decodedString = decoder.decode(e.data);
      try {
        const jsonData = JSON.parse(decodedString);
        if (jsonData.type == "client_join") {
          setClients(jsonData.client);
          if (jsonData.client == 1) {
            ydoc.transact(() => {
              ytext.insert(0, currentNote.content);
            });
          }
        }
        if (jsonData.type === "client_leave") {
          setClients(jsonData.client);
          if (jsonData.client == 1) {
            updateContentNote({ ...currentNote, content: ytext.toString() });
          }
        }
      } catch (error) {}
    };

    wsProvider.ws?.addEventListener("message", messageHandler);

    wsProvider.once("sync", () => {});

    wsProvider.on("status", (e: { status: string }) => {
      if (e.status == "connected") closeModal();
      setConnectionStatus(
        e.status === "connected" ? "connected" : "disconnected",
      );
    });

    return () => {
      updateContentNote({ ...currentNote, content: ytext.toString() });
      wsProvider.ws?.removeEventListener("message", messageHandler);
      awareness.setLocalState(null);
      ydoc.destroy();
      view.destroy();
      wsProvider.disconnect();
      wsProvider.destroy();
    };
  }, [currentNote?.id]);

  return <div ref={editorRef} className="h-full"></div>;
};

export default NoteEditor;

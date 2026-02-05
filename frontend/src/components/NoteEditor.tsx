import { useNotes } from "@/hooks/useNotes";
import type { Note } from "@/types";
import { Editor } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { editor } from "monaco-editor";
import { useModal } from "@/hooks/use-modal";

interface NoteEditorProps {
  currentNote: Note | null;
}

const CURSOR_COLORS = [
  "#ffb61e",
  "#ff6b6b",
  "#4ecdc4",
  "#45b7d1",
  "#96ceb4",
  "#ff8a5b",
  "#a855f7",
  "#ec4899",
];

const getColorFromClientId = (clientId: number) => {
  return CURSOR_COLORS[clientId % CURSOR_COLORS.length];
};

const injectCursorStyles = (clientId: number, color: string, name: string) => {
  const styleId = `yjs-cursor-${clientId}`;

  // Remove existing style if present
  const existing = document.getElementById(styleId);
  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .yRemoteSelection-${clientId} {
      background-color: ${color};
      opacity: 0.3;
    }
    .yRemoteSelectionHead-${clientId} {
      position: absolute;
      border-left: 2px solid ${color};
      border-top: 2px solid ${color};
      height: 100%;
      box-sizing: border-box;
    }
    /* Larger invisible hover area */
    .yRemoteSelectionHead-${clientId}::before {
      content: "";
      position: absolute;
      top: -10px;
      left: -10px;
      width: 24px;
      height: calc(100% + 20px);
      cursor: pointer;
    }
    .yRemoteSelectionHead-${clientId}::after {
      content: "${name}";
      position: absolute;
      top: -1.4em;
      left: -2px;
      font-size: 10px;
      font-weight: 500;
      background-color: ${color};
      color: #000;
      padding: 2px 6px;
      border-radius: 3px 3px 3px 0;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
    }
    .yRemoteSelectionHead-${clientId}:hover::after {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
};

const removeCursorStyles = (clientId: number) => {
  const existing = document.getElementById(`yjs-cursor-${clientId}`);
  if (existing) existing.remove();
};

const WS_BASE_URL = "ws://localhost:8080/api/v1/notes";

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const { openModal, closeModal } = useModal();
  const { updateContentNote } = useNotes();

  const [latestNote, setLatestNote] = useState<Note | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const [debouncedContent] = useDebounce(latestNote?.content, 500);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!currentNote) return;
    setLatestNote(currentNote);
  }, []);

  useEffect(() => {
    if (!currentNote || !latestNote) return;
    if (currentNote.id !== latestNote.id) {
      updateContentNote(latestNote);
      setLatestNote(currentNote);
    }
  }, [currentNote?.id]);

  useEffect(() => {
    if (!currentNote || !debouncedContent) return;
    updateContentNote({ ...currentNote, content: debouncedContent });
  }, [debouncedContent]);

  useEffect(() => {
    openModal("connection-note");
    if (!currentNote || !isEditorReady || !editorRef.current) {
      return;
    }
    setConnectionStatus("connecting");

    const ydoc = new Y.Doc();
    const typeDoc = ydoc.getText("monaco");
    const wsProvider = new WebsocketProvider(
      WS_BASE_URL,
      `${currentNote.id}/ws`,
      ydoc
    );

    const awareness = wsProvider.awareness;
    const userColor = getColorFromClientId(ydoc.clientID);
    const userName = `User-${ydoc.clientID.toString().slice(-4)}`;

    awareness.setLocalStateField("user", {
      color: userColor,
      name: userName,
    });

    const handleAwarenessChange = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const states = awareness.getStates();
      [...added, ...updated].forEach((clientId) => {
        const state = states.get(clientId);
        if (state?.user && clientId !== ydoc.clientID) {
          injectCursorStyles(clientId, state.user.color, state.user.name);
        }
      });

      removed.forEach((clientId) => {
        removeCursorStyles(clientId);
      });
    };

    awareness.on("change", handleAwarenessChange);

    const monacoBinding = new MonacoBinding(
      typeDoc,
      editorRef.current?.getModel()!,
      new Set([editorRef.current]),
      awareness
    );

    const handleTypeDocChange = () => {
      if (!latestNote) return;
      setLatestNote((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          content: typeDoc.toString(),
        };
      });
    };

    typeDoc.observe(handleTypeDocChange);

    wsProvider.once("sync", (isSynced: boolean) => {
      if (!isSynced) {
        closeModal();
        return;
      }

      const hasOtherClients = awareness.getStates().size > 1;

      setTimeout(
        () => {
          if (typeDoc.length === 0) {
            ydoc.transact(() => {
              typeDoc.insert(0, currentNote.content);
            });
          }
          closeModal();
        },
        hasOtherClients ? 300 : 100
      );
    });

    wsProvider.on("status", (e: { status: string }) => {
      setConnectionStatus(
        e.status === "connected" ? "connected" : "disconnected"
      );
    });

    return () => {
      awareness.setLocalState(null);
      ydoc.destroy();
      monacoBinding.destroy();
      wsProvider.disconnect();
      wsProvider.destroy();
    };
  }, [currentNote?.id, isEditorReady]);

  return (
    <div className=" bg-zinc-900  h-full">
      <Editor
        onMount={(editor, _) => {
          editorRef.current = editor;
          setIsEditorReady(true);
        }}
        theme="vs-dark"
        height={"100%"}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          wordWrap: "on",
          padding: { top: 8 },
          smoothScrolling: true,
          lineNumbersMinChars: 2,
        }}
      />
    </div>
  );
};

export default NoteEditor;

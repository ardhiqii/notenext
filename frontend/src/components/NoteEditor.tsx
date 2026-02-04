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

// ...existing code...

// Remove cursor styles when user disconnects
const removeCursorStyles = (clientId: number) => {
  const existing = document.getElementById(`yjs-cursor-${clientId}`);
  if (existing) existing.remove();
};

const WS_BASE_URL = "ws://localhost:8080/api/v1/notes";

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const [noteContent, setNoteContent] = useState("");
  const [prevNote, setPrevNote] = useState<Note | null>(null);
  const [debouncedContent] = useDebounce(noteContent, 500);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [isEditorReady, setIsEditorReady] = useState(false);

  const { openModal, closeModal } = useModal();
  const { updateContentNote } = useNotes();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    openModal("connection-note");
    if (!currentNote || !editorRef.current || !isEditorReady) {
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

    // Single change handler for both add and remove
    const handleAwarenessChange = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      // Handle added/updated users - inject their cursor styles
      const states = awareness.getStates();
      [...added, ...updated].forEach((clientId) => {
        const state = states.get(clientId);
        if (state?.user && clientId !== ydoc.clientID) {
          injectCursorStyles(clientId, state.user.color, state.user.name);
        }
      });

      // Handle removed users - remove their cursor styles
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

    wsProvider.once("sync", (isSynced: boolean) => {
      // console.log({
      //   isSynced,
      //   docs: typeDoc.length,
      //   content: currentNote.content,
      // });

      if (isSynced && typeDoc.length === 0 && currentNote.content) {
        setTimeout(() => {
          // console.log("RUN TIMEOUT");
          if (typeDoc.length === 0) {
            ydoc.transact(() => {
              typeDoc.insert(0, currentNote.content);
            });
          }
        }, 100);
      }
      closeModal();
    });

    wsProvider.on("status", (e: { status: string }) => {
      // console.log({
      //   status: e.status,
      // });
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

  useEffect(() => {
    if (!currentNote) return;
    setNoteContent(currentNote.content);
    setPrevNote(currentNote);
    if (!prevNote) return;
    // if (currentNote.id !== prevNote.id) {
    //   updateContentNote(prevNote);
    // }
  }, [currentNote?.id]);

  // useEffect(() => {
  //   if (!currentNote || debouncedContent === currentNote.content) return;
  //   updateContentNote({ ...currentNote, content: noteContent });
  // }, [debouncedContent]);

  // const updateNoteContentHandler = async (content: string) => {
  //   setNoteContent(content);
  //   if (!currentNote || !prevNote) return;
  //   if (currentNote.id === prevNote.id) {
  //     setPrevNote((prev) => {
  //       if (!prev) return null;
  //       return {
  //         ...prev,
  //         content: content,
  //       };
  //     });
  //   }
  // };

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

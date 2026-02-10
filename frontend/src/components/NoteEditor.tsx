import { useNotes } from "@/hooks/useNotes";
import type { Note } from "@/types";
import { Editor } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { editor } from "monaco-editor";
import { useModal } from "@/hooks/use-modal";
import { getWebSocketBaseUrl } from "@/lib/utils";

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

const WS_BASE_URL = getWebSocketBaseUrl();

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const { openModal, closeModal } = useModal();
  const { updateContentNote } = useNotes();

  const [note, setNote] = useState<Note | null>(null);
  const [clients, setClients] = useState(0);
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  const debounceUpdate = useDebouncedCallback((updatedNote:Note)=>{
    if(!note) return
    if(clients == 1){
      updateContentNote(updatedNote)
    }
  },300)
  const [_, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    if (!currentNote) return;
    setNote(currentNote);
  }, [currentNote?.id]);

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
      ydoc,
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
      awareness,
    );

    const handleTypeDocChange = () => {
      if (!note) return;
      debounceUpdate({...note,content:typeDoc.toString()})
    };

    typeDoc.observe(handleTypeDocChange);

    const messageHandler = (e: MessageEvent) => {
      const decoder = new TextDecoder("utf-8");
      const decodedString = decoder.decode(e.data);
      try {
        const jsonData = JSON.parse(decodedString);
        if (jsonData.type == "client_join") {
          setClients(jsonData.client);
          if (jsonData.client == 1) {
            ydoc.transact(() => {
              typeDoc.insert(0, currentNote.content);
            });
          }
        }
        if (jsonData.type === "client_leave") {
          setClients(jsonData.client);
          if (jsonData.client == 1) {
            updateContentNote({ ...currentNote, content: typeDoc.toString() });
          }
        }
      } catch (error) {}
    };

    wsProvider.ws?.addEventListener("message", messageHandler);

    wsProvider.once("sync", () => {
      closeModal();
    });

    wsProvider.on("status", (e: { status: string }) => {
      setConnectionStatus(
        e.status === "connected" ? "connected" : "disconnected",
      );
    });

    return () => {
      updateContentNote({ ...currentNote, content: typeDoc.toString() });
      wsProvider.ws?.removeEventListener("message", messageHandler);
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
          editor.getModel()?.setEOL(0);
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

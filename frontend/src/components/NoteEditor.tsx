import { useNotes } from "@/hooks/useNotes";
import type { Note } from "@/types";
import { Editor } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from 'y-monaco'
import {editor} from "monaco-editor"

interface NoteEditorProps {
  currentNote: Note | null;
}

const WS_BASE_URL = "ws://172.18.32.1:8080/api/v1/notes";

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const [noteContent, setNoteContent] = useState("");
  const [prevNote, setPrevNote] = useState<Note | null>(null);
  const [debouncedContent] = useDebounce(noteContent, 500);
  const { updateContentNote } = useNotes();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const ydoc = new Y.Doc();
  const type = ydoc.getText('monaco')
  const wsProvider = new WebsocketProvider(
    `${WS_BASE_URL}/${currentNote?.id}/ws`,
    currentNote?.id || `note-${Date.now().toString()}`,
    ydoc
  );

  const monacoBinding = new MonacoBinding(type,editorRef.current?.getModel()!,new Set([editorRef.current!]),wsProvider.awareness)


  useEffect(() => {
    if (!currentNote) return;
    setNoteContent(currentNote.content);
    setPrevNote(currentNote);
    if (!prevNote) return;
    if (currentNote.id !== prevNote.id) {
      updateContentNote(prevNote);
    }
  }, [currentNote?.id]);

  useEffect(() => {
    if (!currentNote || debouncedContent === currentNote.content) return;
    updateContentNote({ ...currentNote, content: noteContent });
  }, [debouncedContent]);

  const updateNoteContentHandler = async (content: string) => {
    setNoteContent(content);
    if (!currentNote || !prevNote) return;
    if (currentNote.id === prevNote.id) {
      setPrevNote((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          content: content,
        };
      });
    }
  };

  return (
    <div className=" bg-zinc-900  h-full">
      <Editor
        value={noteContent}
        onMount={(editor,_)=>{
          editorRef.current = editor
        }}
        onChange={(value) => updateNoteContentHandler(value || "")}
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

import { useNotes } from "@/hooks/useNotes";
import type { Note } from "@/types";
import { Editor } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

interface NoteEditorProps {
  currentNote: Note | null;
}

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const [noteContent, setNoteContent] = useState("");
  const [prevNote, setPrevNote] = useState<Note | null>(null);
  const [debouncedContent] = useDebounce(noteContent, 500);
  const { updateContentNote } = useNotes();

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

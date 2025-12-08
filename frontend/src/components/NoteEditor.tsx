import type { Note } from "@/types";
import { Editor, type OnMount } from "@monaco-editor/react";

interface NoteEditorProps {
  currentNote: Note;
  changeNoteValue: (value: string) => void;
  activeNote: string;
  addNote: () => void;
  notes?: Note[];
}

const NoteEditor = ({
  currentNote,
  changeNoteValue,
}: NoteEditorProps) => {

  return (
    <div className=" bg-zinc-900  h-full">
      <Editor
        value={currentNote.value}
        onChange={(value) => changeNoteValue(value || "")}
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

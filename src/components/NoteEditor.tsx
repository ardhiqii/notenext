import type { Note } from "@/types";
import { Editor, type OnMount } from "@monaco-editor/react";

interface NoteEditorProps {
  currentNote: Note;
  changeNoteValue: (value: string) => void;
  activeNote: string;
  addNote: () => void;
}

const NoteEditor = ({ currentNote, changeNoteValue, addNote }: NoteEditorProps) => {
  const handleEditorMount: OnMount = (editor, monaco) => {
    editor.addAction({
      id: "add-new-note",
      label: "Add New Note",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyN,
      ],
      run: addNote
    });
  };
  return (
    <div className=" bg-zinc-900  h-full ">
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
        onMount={handleEditorMount}
      />
    </div>
  );
};

export default NoteEditor;

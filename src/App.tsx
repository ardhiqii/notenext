import TabsBar from "@/components/TabsBar";
import NoteEditor from "@/components/NoteEditor";
import { useNotes } from "@/hooks/useNotes";

function App() {
  const {
    notes,
    activeNote,
    setActiveNote,
    addNote,
    closeNote,
    setNotes,
    getCurrentNote,
    changeNoteValue,
  } = useNotes();

  return (
    <div className="h-screen relative flex flex-col">
      <TabsBar
        notes={notes}
        activeNote={activeNote}
        setActiveNote={setActiveNote}
        addNote={addNote}
        closeNote={closeNote}
        setNotes={setNotes}
      />
      <div className="flex-1">
        <NoteEditor
          currentNote={getCurrentNote()}
          changeNoteValue={changeNoteValue}
          activeNote={activeNote}
        />
      </div>
    </div>
  );
}

export default App;

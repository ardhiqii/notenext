import TabsBar from "@/components/TabsBar";
import NoteEditor from "@/components/NoteEditor";
import { useNotes } from "@/hooks/useNotes";
import ModalProvider from "./providers/modal-provider";
import SearchNoteModal from "./components/modals/search-note-modal";

function App() {
  const {
    notes,
    activeNote,
    setActiveNote,
    addNote,
    closeNote,
    renameNote,
    setNotes,
    getCurrentNote,
    changeNoteValue,
  } = useNotes();

  return (
    <>
    <ModalProvider/>
    <SearchNoteModal/>
      <div className="h-screen relative flex flex-col">
        <TabsBar
          notes={notes}
          activeNote={activeNote}
          setActiveNote={setActiveNote}
          addNote={addNote}
          closeNote={closeNote}
          renameNote={renameNote}
          setNotes={setNotes}
        />
        <div className="flex-1">
          <NoteEditor
            currentNote={getCurrentNote()}
            changeNoteValue={changeNoteValue}
            activeNote={activeNote}
            addNote={addNote}
          />
        </div>
      </div>
    </>
  );
}

export default App;

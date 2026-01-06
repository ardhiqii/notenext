import TabsBar from "@/components/TabsBar";
import NoteEditor from "@/components/NoteEditor";
import { useNotes } from "@/hooks/useNotes";
import ModalProvider from "./providers/modal-provider";
import { useKeyboardShortcuts } from "./lib/keyboard-shortcuts";
import { useModal } from "./hooks/use-modal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}

function Root() {
  const {
    tabs,
    currentNoteId,
    setCurrentNoteId,
    currentNote,
    addNote,
    closeNote,
    renameNote,
  } = useNotes();
  const { openModal } = useModal();

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "k",
      ctrlKey: true,
      callback: () => openModal("search-note"),
    },
    {
      key: "n",
      ctrlKey: true,
      altKey: true,
      callback: addNote,
    },
    {
      key: "w",
      ctrlKey: true,
      altKey: true,
      callback: () => {
        closeNote(currentNoteId!);
      },
    },
  ]);
  return (
    <>
      {/* <ModalProvider notes={notes} setActiveNote={setActiveNote} /> */}
      <div className="h-screen flex flex-col">
        {currentNoteId && tabs && currentNote && (
          <>
            <TabsBar
              tabs={tabs}
              currentNoteId={currentNoteId}
              setCurrentNoteId={setCurrentNoteId}
              addNote={addNote}
              closeNote={closeNote}
              renameNote={renameNote}
            />
            <NoteEditor currentNote={currentNote} />
          </>
        )}
      </div>
    </>
  );
}

export default App;

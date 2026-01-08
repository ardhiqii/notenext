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
    currentNote,
    createNewNote,
    currentNoteId,
    setCurrentNoteId,
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
      callback: createNewNote,
    },
    {
      key: "w",
      ctrlKey: true,
      altKey: true,
      callback: closeNote,
    },
  ]);
  return (
    <>
      {/* <ModalProvider notes={tabs} setActiveNote={setCurrentNoteId} /> */}
      <div className="h-screen flex flex-col">
        {currentNoteId && tabs && (
          <>
            <TabsBar
              tabs={tabs}
              currentNoteId={currentNoteId}
              setCurrentNoteId={setCurrentNoteId}
              addNote={createNewNote}
              closeNote={closeNote}
              renameNote={renameNote}
            />
          </>
        )}
        {/* {currentNote && <NoteEditor currentNote={currentNote} />} */}
      </div>
    </>
  );
}

export default App;

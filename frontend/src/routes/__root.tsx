import { Toaster } from "@/components/ui/sonner";
import ModalProvider from "@/providers/modal-provider";
import {
  createRootRoute,
  createRootRouteWithContext,
  Link,
  Outlet,
  useParams,
} from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import { NoteQueryOptions } from "@/hooks/note-query-options";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootLayout,
  },
);

function RootLayout() {
  const { noteId } = useParams({ from: "/n/$noteId" });

  const { data: currentNote } = useQuery(
    NoteQueryOptions.getCurrentNoteById(noteId),
  );
  const { openModal } = useModal();
  const { closeNote, changeCurrentNote, createNewNote } = useNotes();
  useHotkey("Mod+K", () => {
    openModal("search-note", {
      callback: {
        changeCurrentNote: changeCurrentNote,
      },
    });
  });
  useHotkey("Mod+Alt+N", createNewNote);
  useHotkey("Mod+Alt+W", () => {
    openModal("delete-note", {
      data: {
        note: currentNote,
      },
      callback: {
        deleteNote: closeNote,
      },
    });
  });
  return (
    <>
      <ModalProvider />
      <div className="h-screen flex flex-col ">
        <TabsBar />
        <div className="flex-1">
          <Outlet />
        </div>
        <Toaster position="top-center" />

        <TanStackRouterDevtools />
      </div>
    </>
  );
}

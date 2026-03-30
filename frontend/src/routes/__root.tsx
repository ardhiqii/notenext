import { Toaster } from "@/components/ui/sonner";
import ModalProvider from "@/providers/modal-provider";
import {
  createRootRouteWithContext,
  Outlet,
  useParams,
} from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { useAuth } from "@/hooks/use-auth";
import { api, refreshAccessToken } from "@/lib/api";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async () => {
      const hash = window.location.hash;
      if (hash.startsWith("#token=")) {
        const token = hash.slice(7);
        useAuth.getState().setToken(token);
        const resp = await api.get("/auth/me");
        if (resp) {
          useAuth.getState().setUser(resp.data);
        }
      }

      const acceessToken = useAuth.getState().accessToken;
      if (!acceessToken) {
        const access_token = await refreshAccessToken();
        if (access_token) {
          useAuth.getState().setToken(access_token);
        }
      }
      const resp = await api.get("/auth/me");
      console.log(resp);
    },
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

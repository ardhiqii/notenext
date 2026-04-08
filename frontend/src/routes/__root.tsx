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
import { getOrRefreshToken } from "@/lib/api";
import { AuthQueryOptions } from "@/queries/auth-query-options";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";
import { PublicNoteQueryOptions } from "@/queries/public-note-query-options";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async ({ context }) => {
      const hash = window.location.hash;
      if (hash.startsWith("#token=")) {
        const token = hash.slice(7);
        useAuth.getState().setToken(token);
        queryClient.removeQueries({ queryKey: queryKeys.notes.all });
      } else {
        try {
          const { accessToken, refreshFailed } = useAuth.getState();
          if (!accessToken && !refreshFailed) {
            const access_token = await getOrRefreshToken();
            if (access_token) {
              useAuth.getState().setToken(access_token);
            }
          }
        } catch (err) {
          useAuth.getState().setRefreshFailed(true);
          return;
        }
      }

      const { accessToken } = useAuth.getState();
      if (accessToken) {
        await context.queryClient.ensureQueryData(
          AuthQueryOptions.getCurrentUser,
        );
      }
    },
    component: RootLayout,
  },
);

function RootLayout() {
  const { noteId } = useParams({ from: "/n/$noteId" });
  const user = useAuth((state) => state.user);

  const { data: currentNote } = useQuery(
    user
      ? NoteQueryOptions.getCurrentNoteById(noteId)
      : PublicNoteQueryOptions.getCurrentNoteById(noteId),
  );
  const openModal = useModal((state) => state.openModal);
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

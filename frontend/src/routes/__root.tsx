import { Toaster } from "@/components/ui/sonner";
import ModalProvider from "@/providers/modal-provider";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import { type QueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { getOrRefreshToken } from "@/lib/api";
import { AuthQueryOptions } from "@/queries/auth-query-options";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";

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
  const openModal = useModal((state) => state.openModal);
  const { changeCurrentNote, createNewNote } = useNotes();
  useHotkey("Mod+K", () => {
    openModal("search-note", {
      callback: {
        changeCurrentNote: changeCurrentNote,
      },
    });
  });
  useHotkey("Mod+Alt+N", createNewNote);

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

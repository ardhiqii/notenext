import { Toaster } from "@/components/ui/sonner";
import ModalProvider from "@/providers/modal-provider";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import Sidebar from "@/components/sidebar";
import ActivityBar from "@/components/activity-bar";
import { type QueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { getOrRefreshToken } from "@/lib/api";
import { AuthQueryOptions } from "@/queries/auth-query-options";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";
import useSidebar from "@/hooks/use-sidebar";

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
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();
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
      <div className="h-screen flex flex-col">
        <div className="flex-1 flex min-h-0">
          <ActivityBar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <Sidebar collapsed={sidebarCollapsed} />
          <div className="flex flex-1 flex-col min-w-0">
            <TabsBar />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster position="top-center" />

        <TanStackRouterDevtools />
      </div>
    </>
  );
}

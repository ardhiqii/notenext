import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import Sidebar from "@/components/sidebar";
import ActivityBar from "@/components/activity-bar";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import useSidebar from "@/hooks/use-sidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
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
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex min-h-0">
        <ActivityBar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <TabsBar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  );
}

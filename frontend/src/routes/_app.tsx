import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import Sidebar from "@/components/sidebar";
import ActivityBar from "@/components/activity-bar";
import {
  MobileBottomNav,
  MobileMenu,
  MobileNotesDrawer,
  MobileTabsOverview,
  MobileTopBar,
} from "@/components/mobile";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import useSidebar from "@/hooks/use-sidebar";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useVisualViewportKeyboard } from "@/hooks/use-visual-viewport";
import { useEffect } from "react";
import { useMatchRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

export function AppLayout() {
  const openModal = useModal((state) => state.openModal);
  const { changeCurrentNote, createNewNote } = useNotes();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();
  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const routeKey = noteMatch
    ? (noteMatch as { noteId: string }).noteId
    : "workspace";

  useVisualViewportKeyboard();

  useEffect(() => {
    // Mobile surfaces are intentionally ephemeral. Reset them whenever the
    // route changes so a drawer cannot remain over a new note or redirect.
    useMobileUi.getState().reset();
  }, [routeKey]);

  const openGlobalSearch = () => {
    // Mod+K can fire while a compact Dialog is open. Reset it before opening
    // the global command dialog so two Radix surfaces never overlap.
    useMobileUi.getState().reset();
    openModal("search-note", {
      callback: {
        changeCurrentNote: changeCurrentNote,
      },
    });
  };

  useHotkey("Mod+K", openGlobalSearch);
  useHotkey("Mod+Alt+N", createNewNote);

  return (
    <div className="mobile-app-shell flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden overflow-x-hidden">
      <div className="flex min-h-0 flex-1">
        <div className="hidden h-full shrink-0 lg:flex">
          <ActivityBar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <Sidebar collapsed={sidebarCollapsed} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <div className="hidden lg:block">
            <TabsBar />
          </div>
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
      </div>

      <MobileNotesDrawer />
      <MobileTabsOverview />
      <MobileMenu />

      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  );
}

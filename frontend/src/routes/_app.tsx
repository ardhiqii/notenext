import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect } from "react";
import TabsBar from "@/components/tabs-bar";
import Sidebar from "@/components/sidebar";
import ActivityBar from "@/components/activity-bar";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { APP_VERSION } from "@/lib/version";
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

  const user = useAuth((state) => state.user);

  // One-time-per-version "What's New" popup.
  // Logged-in: compare against last_seen_changelog_version from /auth/me.
  // Guest: localStorage fallback.
  // Delayed 2.5s, then retries every 2s (up to 6x) until no other modal is
  // open — the connection modal opens on note-editor mount and can still be
  // up at the 2.5s mark, so a single check would silently skip the popup.
  // Opening only when type === null means we never stomp an existing modal.
  // NOTE: no ref guard here — React StrictMode double-invokes effects in dev
  // (mount → cleanup → mount); a `done` ref set before scheduling would let
  // the second invocation early-return and the timer would never fire.
  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tryOpen = () => {
      if (cancelled) return;
      if (attempts >= 6) return;
      if (useModal.getState().type !== null) {
        attempts += 1;
        timer = setTimeout(tryOpen, 2000);
        return;
      }
      const seen = user
        ? user.last_seen_changelog_version === APP_VERSION
        : localStorage.getItem("notenext:changelog-seen") === APP_VERSION;
      if (!seen) openModal("changelog");
    };

    timer = setTimeout(tryOpen, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, openModal]);

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

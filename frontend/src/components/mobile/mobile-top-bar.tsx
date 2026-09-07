import { Menu, Rows3 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useOpenTabs } from "@/hooks/use-open-tabs";

const MobileTopBar = () => {
  const surface = useMobileUi((state) => state.surface);
  const toggleSurface = useMobileUi((state) => state.toggleSurface);
  const { currentNoteId, notes, publicNotes, visibleTabs, isLoading } = useOpenTabs();

  const currentTitle = useMemo(() => {
    const note = [...(notes ?? []), ...(publicNotes ?? [])].find(
      (candidate) => candidate.id === currentNoteId,
    );
    return note?.title || (isLoading ? "Loading note" : "Untitled note");
  }, [currentNoteId, isLoading, notes, publicNotes]);

  return (
    <header className="mobile-top-bar safe-area-top flex shrink-0 items-center gap-2 border-b bg-background px-2 lg:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="min-h-11 min-w-11"
        aria-label="Open notes"
        aria-controls="mobile-notes-drawer"
        aria-expanded={surface === "notes"}
        onClick={() => toggleSurface("notes")}
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-medium" title={currentTitle}>
          {currentTitle}
        </p>
        <p className="text-xs text-muted-foreground">NoteNext</p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="relative min-h-11 min-w-11"
        aria-label="Open tabs"
        aria-controls="mobile-tabs-overview"
        aria-expanded={surface === "tabs"}
        onClick={() => toggleSurface("tabs")}
      >
        <Rows3 aria-hidden="true" />
        <span className="sr-only">
          {visibleTabs.length} {visibleTabs.length === 1 ? "open note" : "open notes"}
        </span>
        {visibleTabs.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
          >
            {visibleTabs.length > 9 ? "9+" : visibleTabs.length}
          </span>
        )}
      </Button>
    </header>
  );
};

export default MobileTopBar;

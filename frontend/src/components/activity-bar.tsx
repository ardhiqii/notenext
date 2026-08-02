import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useModal } from "@/hooks/use-modal";
import { useNotes } from "@/hooks/use-notes";

interface ActivityBarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * VS Code / Obsidian-style activity bar — a slim vertical strip pinned to the
 * far left that stays visible regardless of sidebar state. The sidebar toggle
 * lives here so it never shifts when the sidebar collapses.
 */
const ActivityBar = ({ collapsed, onToggle }: ActivityBarProps) => {
  const openModal = useModal((state) => state.openModal);
  const { changeCurrentNote } = useNotes();

  return (
    <div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
      <button
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        onClick={onToggle}
        title={collapsed ? "Show navigation" : "Hide navigation"}
        aria-label={collapsed ? "Show navigation" : "Hide navigation"}
      >
        {collapsed ? (
          <PanelLeftOpen className="w-5" strokeWidth={1.5} />
        ) : (
          <PanelLeftClose className="w-5" strokeWidth={1.5} />
        )}
      </button>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        onClick={() =>
          openModal("search-note", {
            callback: { changeCurrentNote },
          })
        }
        title="Search notes (Ctrl+K)"
        aria-label="Search notes"
      >
        <Search className="w-4.5 h-4.5" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default ActivityBar;

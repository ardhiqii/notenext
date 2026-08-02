import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import type { TabGroupWithTabs } from "@/types";
import { cn } from "@/lib/utils";

interface SidebarGroupProps {
  group: TabGroupWithTabs;
  isActive: boolean;
  currentNoteId?: string;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelect: () => void;
  onSelectNote: (noteId: string) => void;
  onContextMenu: (e: React.MouseEvent, group: TabGroupWithTabs) => void;
}

const SidebarGroup = ({
  group,
  isActive,
  currentNoteId,
  onToggleCollapse,
  onRename,
  onDelete,
  onSelect,
  onSelectNote,
  onContextMenu,
}: SidebarGroupProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, transform, transition, setNodeRef } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(true);
    setEditedName(group.name);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== group.name) {
      onRename(trimmed);
    } else {
      setEditedName(group.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditedName(group.name);
      setIsEditing(false);
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        role="button"
        tabIndex={0}
        className={cn(
          "group/sidebar-group flex items-center gap-1 pr-1.5 pl-1 text-[13px] select-none",
          "cursor-pointer text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "bg-accent text-foreground",
        )}
        onClick={onSelect}
        onContextMenu={(e) => onContextMenu(e, group)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect();
        }}
      >
      {/* Collapse toggle */}
      <div
        className="flex h-7 w-4 items-center justify-center text-muted-foreground/70 hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        title={group.collapsed ? "Expand group" : "Collapse group"}
      >
        {group.collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Folder icon */}
      <Folder
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground/60",
          isActive && "text-sky-500",
        )}
        strokeWidth={1.75}
      />

      {/* Name (editable inline) */}
      <div
        className="min-w-0 flex-1"
        onDoubleClick={startEditing}
        title={group.name}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-sm border bg-background px-1 py-0.5 text-[13px] outline-none"
          />
        ) : (
          <span className="block truncate py-1">{group.name}</span>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/sidebar-group:opacity-100">
        <button
          className="rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          onClick={(e) => startEditing(e)}
          title="Rename group"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete group"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex h-7 w-3 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity group-hover/sidebar-group:opacity-100 hover:text-foreground active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* Tab count — pinned far right, always visible */}
      <span
        className={cn(
          "shrink-0 rounded px-1 text-[11px] leading-4 tabular-nums text-muted-foreground/70",
          isActive && "text-muted-foreground",
        )}
      >
        {group.tabs.length}
      </span>
      </div>

      {/* Tab list — visible when the group is expanded, mirrors Public.
          VS Code-style indent guide: vertical line on the left. */}
      {!group.collapsed && group.tabs.length > 0 && (
        <div className="relative mt-0.5 space-y-0.5 pl-6">
          <div
            aria-hidden
            className="absolute bottom-0 left-[11px] top-0 w-px bg-muted-foreground/35"
          />
          {group.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectNote(tab.id)}
              className={cn(
                "block w-full truncate rounded-r px-2 py-1 pl-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground cursor-pointer",
                tab.id === currentNoteId &&
                  "bg-accent text-foreground hover:bg-accent",
              )}
            >
              {tab.title}
            </button>
          ))}
        </div>
      )}

      {/* Empty group hint — teaches how to populate a group */}
      {group.tabs.length === 0 && (
        <div className="rounded-md px-5 py-0.5 text-[11px] leading-4 text-muted-foreground/50 italic">
          Drag tabs here or right-click a tab → Move to group
        </div>
      )}
    </>
  );
};
export default SidebarGroup;

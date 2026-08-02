import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery } from "@tanstack/react-query";
import { useMatchRoute } from "@tanstack/react-router";
import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useNotes } from "@/hooks/use-notes";
import { cn } from "@/lib/utils";
import { GroupMutations, GroupQueryOptions, NoteQueryOptions } from "@/queries";
import type { TabGroupWithTabs } from "@/types";
import SidebarGroup from "./sidebar-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface SidebarProps {
  collapsed?: boolean;
}

const Sidebar = ({ collapsed = false }: SidebarProps) => {
  const user = useAuth((state) => state.user);
  const { changeCurrentNote } = useNotes();

  const { data: tabsWithGroups } = useQuery({
    ...GroupQueryOptions.getGroupsWithTabs,
    enabled: !!user,
  });

  // Public/global seeded notes — shown for everyone (guest + logged-in).
  const { data: publicNotes } = useQuery(NoteQueryOptions.getPublicNotes);

  const createGroupMutation = GroupMutations.createGroup();
  const renameGroupMutation = GroupMutations.renameGroup();
  const deleteGroupMutation = GroupMutations.deleteGroup();
  const reorderGroupsMutation = GroupMutations.reorderGroups();
  const toggleCollapseMutation = GroupMutations.toggleCollapse();
  const assignTabToGroupMutation = GroupMutations.assignTabToGroup();

  // Guard: auto-create default group at most once per session
  const autoCreateAttempted = useRef(false);

  // Auto-create a "General" group when the user has tabs but zero groups,
  // so tabs never just float around unorganized.
  useEffect(() => {
    if (autoCreateAttempted.current) return;
    if (!tabsWithGroups) return;
    if (tabsWithGroups.groups.length > 0) return;
    if (tabsWithGroups.ungroupedTabs.length === 0) return;

    autoCreateAttempted.current = true;
    const tabIds = tabsWithGroups.ungroupedTabs.map((t) => t.id);

    createGroupMutation.mutate(
      { name: "General" },
      {
        onSuccess: (newGroup) => {
          tabIds.forEach((tabId) => {
            assignTabToGroupMutation.mutate({ tabId, groupId: newGroup.id });
          });
          toast.info(`Created "General" group with ${tabIds.length} tab(s)`);
        },
        onError: () => {
          toast.error("Failed to create default group");
        },
      },
    );
  }, [tabsWithGroups, createGroupMutation, assignTabToGroupMutation]);

  // Inline create group
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  // Right-click context menu on a group row
  const [groupMenu, setGroupMenu] = useState<{
    group: TabGroupWithTabs;
    x: number;
    y: number;
  } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamedName, setRenamedName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const currentNoteId = noteMatch
    ? (noteMatch as { noteId: string }).noteId
    : undefined;

  // Find which group owns the currently open tab (for active highlight)
  const activeGroupId = useMemo(() => {
    if (!currentNoteId || !tabsWithGroups) return undefined;
    return tabsWithGroups.groups.find((g) =>
      g.tabs.some((t) => t.id === currentNoteId),
    )?.id;
  }, [currentNoteId, tabsWithGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const groups = tabsWithGroups?.groups ?? [];

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      setIsCreating(false);
      return;
    }
    createGroupMutation.mutate(
      { name: newGroupName.trim() },
      {
        onSuccess: () => {
          setNewGroupName("");
          setIsCreating(false);
          toast.info(
            `Group "${newGroupName.trim()}" created. Right-click a tab → Move to group`,
          );
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...groups];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderGroupsMutation.mutate({
      groupIds: reordered.map((g) => g.id),
    });
  };

  const handleSelectGroup = useCallback(
    (group: TabGroupWithTabs) => {
      // Mark this group as the active target for new notes.
      useActiveGroup.getState().setActiveGroup(group.id);
      // Expand collapsed groups so their tabs become visible
      if (group.collapsed) {
        toggleCollapseMutation.mutate({ id: group.id, collapsed: false });
      }
      const firstTab = group.tabs[0];
      if (firstTab) {
        changeCurrentNote(firstTab.id);
      }
    },
    [toggleCollapseMutation, changeCurrentNote],
  );

  const handleToggleCollapse = useCallback(
    (group: TabGroupWithTabs) => {
      toggleCollapseMutation.mutate({
        id: group.id,
        collapsed: !group.collapsed,
      });
    },
    [toggleCollapseMutation],
  );

  const handleDeleteGroup = useCallback(
    (group: TabGroupWithTabs) => {
      deleteGroupMutation.mutate({ id: group.id });
      setGroupMenu(null);
    },
    [deleteGroupMutation],
  );

  const openGroupMenu = (e: React.MouseEvent, group: TabGroupWithTabs) => {
    e.preventDefault();
    setRenamedName(group.name);
    setIsRenaming(false);
    setGroupMenu({ group, x: e.clientX, y: e.clientY });
  };

  const commitRename = () => {
    const group = groupMenu?.group;
    if (!group) return;
    const trimmed = renamedName.trim();
    if (trimmed && trimmed !== group.name) {
      renameGroupMutation.mutate({ id: group.id, name: trimmed });
    }
    setGroupMenu(null);
    setIsRenaming(false);
  };

  if (!user) return null;
  if (collapsed) return null;

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-sidebar">
      {/* Public section — global seeded notes, visible even when logged in */}
      {publicNotes && publicNotes.length > 0 && (
        <div className="px-3 pb-1 pt-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            Public
          </span>
          <div className="mt-1 space-y-0.5">
            {publicNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => changeCurrentNote(note.id)}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                {note.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          Groups
        </span>
        <button
          className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            setIsCreating((v) => !v);
            setNewGroupName("");
          }}
          title="New group"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Inline create input */}
      {isCreating && (
        <div className="px-2 pb-1.5">
          <input
            ref={createInputRef}
            autoFocus
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onBlur={handleCreateGroup}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateGroup();
              } else if (e.key === "Escape") {
                setIsCreating(false);
                setNewGroupName("");
              }
            }}
            placeholder="Group name"
            className="h-7 w-full rounded-md border bg-background px-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {/* Group list */}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5">
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground/60">
            No groups yet. Create one to organize your tabs.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={groups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {groups.map((group) => (
                <SidebarGroup
                  key={group.id}
                  group={group}
                  isActive={group.id === activeGroupId}
                  onToggleCollapse={() => handleToggleCollapse(group)}
                  onRename={(name) =>
                    renameGroupMutation.mutate({ id: group.id, name })
                  }
                  onDelete={() => handleDeleteGroup(group)}
                  onSelect={() => handleSelectGroup(group)}
                  onContextMenu={openGroupMenu}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Group context menu */}
      {groupMenu && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) {
              setGroupMenu(null);
              setIsRenaming(false);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <div
              style={{
                position: "fixed",
                left: groupMenu.x,
                top: groupMenu.y,
                width: 0,
                height: 0,
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {isRenaming ? (
              /* Plain input block, NOT a DropdownMenuItem — Radix items
                 block pointer focus so inputs inside them can't be typed */
              <div className="px-2 py-1.5">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renamedName}
                  onChange={(e) => setRenamedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      setGroupMenu(null);
                      setIsRenaming(false);
                    }
                  }}
                  onBlur={commitRename}
                  className={cn(
                    "w-full rounded border bg-background px-1.5 py-0.5 text-xs outline-none",
                  )}
                />
              </div>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRenaming) {
                      setIsRenaming(true);
                      requestAnimationFrame(() =>
                        renameInputRef.current?.focus(),
                      );
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGroup(groupMenu.group);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Create-from-empty shortcut (matches context menu icon language) */}
      {groups.length === 0 && !isCreating && (
        <button
          className="mx-2 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setIsCreating(true)}
        >
          <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
          New group
        </button>
      )}
    </aside>
  );
};

export default Sidebar;

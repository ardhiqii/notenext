import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  CircleUserRound,
  Ellipsis,
  FilePlusCorner,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  WrapText,
} from "lucide-react";
import { useEditorSettings } from "@/hooks/use-editor-settings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNavigate, useMatchRoute } from "@tanstack/react-router";
import { NoteQueryOptions, GroupQueryOptions, queryKeys, NoteMutations, GroupMutations } from "@/queries";
import type { Note } from "@/types";
import { useNotes } from "@/hooks/use-notes";
import Tab from "./tab";
import TabContextMenu from "./tab-context-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import React, { useState, useCallback, useMemo } from "react";
import { Button } from "./ui/button";
import { AuthMutations } from "@/queries/auth-mutations";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TabsBar = ({
  sidebarCollapsed = false,
  onToggleSidebar = () => {},
}: {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) => {
  const { wordWrap, toggleWordWrap } = useEditorSettings();
  const user = useAuth((state) => state.user);
  const openModal = useModal((state) => state.openModal);
  const { createNewNote } = useNotes();
  const logoutMutate = AuthMutations.logout();
  const navigate = useNavigate();

  const { data: notes, isSuccess } = useQuery(
    NoteQueryOptions.getAllNoteOnlyTitle,
  );
  // Groups data is shared with the sidebar via the same React Query cache.
  const { data: tabsWithGroups } = useQuery({
    ...GroupQueryOptions.getGroupsWithTabs,
    // Only fetch groups when user is logged in (guest users don't need groups)
    enabled: !!user,
  });

  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const currentNoteId = noteMatch ? (noteMatch as { noteId: string }).noteId : undefined;

  const queryClient = useQueryClient();
  const updateTabPositionMutation = NoteMutations.updateTabPosition();
  const createGroupMutation = GroupMutations.createGroup();
  const assignTabToGroupMutation = GroupMutations.assignTabToGroup();

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    tab: Note;
    x: number;
    y: number;
  } | null>(null);

  // Groups that are collapsed hide their tabs from the strip (browser metaphor)
  const collapsedGroupIds = useMemo(
    () =>
      new Set(
        (tabsWithGroups?.groups ?? [])
          .filter((g) => g.collapsed)
          .map((g) => g.id),
      ),
    [tabsWithGroups?.groups],
  );

  // Flat tab strip: all open tabs, minus tabs belonging to collapsed groups
  const visibleTabs = useMemo(
    () =>
      (notes ?? []).filter(
        (t) => !(t.groupId && collapsedGroupIds.has(t.groupId)),
      ),
    [notes, collapsedGroupIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    if (!tabs) return;

    const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
    const newIndex = tabs.findIndex((tab) => tab.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tabs, oldIndex, newIndex);
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, reordered);
    reordered.forEach((tab, index) => {
      const newPosition = index + 1;
      if (tab.positionAt !== newPosition) {
        updateTabPositionMutation.mutate({
          id: tab.id,
          positionAt: newPosition,
        });
      }
    });
  };

  const handleAddNote = () => {
    createNewNote();
  };

  // Right-click context menu handlers
  const handleTabContextMenu = useCallback(
    (tab: Note, e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ tab, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCloseContextMenu = () => setContextMenu(null);

  const handleCreateAndAssign = useCallback(
    (name: string, tabId: string) => {
      createGroupMutation.mutate(
        { name },
        {
          onSuccess: (result) => {
            assignTabToGroupMutation.mutate({ tabId, groupId: result.id });
            setContextMenu(null);
          },
        },
      );
    },
    [createGroupMutation, assignTabToGroupMutation],
  );

  const handleAssignToGroup = useCallback(
    (tabId: string, groupId: string) => {
      assignTabToGroupMutation.mutate({ tabId, groupId });
      setContextMenu(null);
    },
    [assignTabToGroupMutation],
  );

  const handleRemoveFromGroup = useCallback(
    (tabId: string) => {
      assignTabToGroupMutation.mutate({ tabId, groupId: null });
      setContextMenu(null);
    },
    [assignTabToGroupMutation],
  );

  return (
    <div className="w-full flex bg-background">
      {/* Hide/show navigation toggle (Obsidian-style) */}
      <div
        className="h-full flex items-center px-2 cursor-pointer text-muted-foreground hover:bg-card hover:text-foreground shrink-0"
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
        aria-label={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
        role="button"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="w-5" strokeWidth={1.5} />
        ) : (
          <PanelLeftClose className="w-5" strokeWidth={1.5} />
        )}
      </div>
      <div
        className={cn(
          "flex-1 flex overflow-x-auto",
          "[&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full",
        )}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        >
          <SortableContext
            items={visibleTabs.map((tab) => tab.id)}
            strategy={horizontalListSortingStrategy}
          >
            {isSuccess &&
              visibleTabs.map((tab) => (
                <Tab key={tab.id} tab={tab} onContextMenu={handleTabContextMenu} />
              ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="flex space-x-1 flex-row-reverse">
        {user ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="h-full flex items-center px-2 cursor-pointer hover:bg-card">
                  <Ellipsis strokeWidth={1} className="w-5" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem onClick={toggleWordWrap}>
                      <WrapText className="w-4 mr-1.5 ml-0.5" />
                      Word Wrap
                      {wordWrap && <Check className="ml-auto w-3.5 h-3.5" />}
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">Ctrl+Alt+Z</TooltipContent>
                </Tooltip>
                <DropdownMenuSeparator />
                {user && (
                  <>
                    <DropdownMenuItem
                      onClick={() => navigate({ to: "/settings" })}
                    >
                      <CircleUserRound className="w-4 mr-1.5 ml-0.5" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        logoutMutate.mutate(undefined, {
                          onSuccess: () => {
                            navigate({
                              to: "/",
                            });
                          },
                        });
                      }}
                    >
                      <LogOut className="w-4 mr-1.5 ml-0.5" />
                      Logout
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <ArrowDownToLine className="w-4 mr-2" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    openModal("export-note", {
                      data: {
                        noteId: currentNoteId,
                      },
                    })
                  }
                >
                  <ArrowUpToLine className="w-4 mr-2" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div
              className="h-full flex items-center px-2 cursor-pointer hover:bg-card"
              onClick={handleAddNote}
            >
              <FilePlusCorner className="w-5" strokeWidth={1} />
            </div>
          </>
        ) : (
          <Button
            variant={"ghost"}
            className="h-full cursor-pointer dark:hover:bg-primary/10 rounded-none"
            onClick={() => {
              navigate({ to: "/login" });
            }}
          >
            <span>Log in</span>
            <CircleUserRound className="mt-0.5" />
          </Button>
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          groups={tabsWithGroups?.groups ?? []}
          isOpen={true}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={handleCloseContextMenu}
          onCreateGroup={handleCreateAndAssign}
          onAssignToGroup={handleAssignToGroup}
          onRemoveFromGroup={handleRemoveFromGroup}
        />
      )}
    </div>
  );
};

export default React.memo(TabsBar);

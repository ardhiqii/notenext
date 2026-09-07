import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder,
  FolderPlus,
  Globe,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useOpenTabs } from "@/hooks/use-open-tabs";
import { useAuth } from "@/hooks/use-auth";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useNotes } from "@/hooks/use-notes";
import { GroupMutations } from "@/queries";
import { cn } from "@/lib/utils";
import type { TabGroupWithTabs } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MobileNotesDrawer = () => {
  const surface = useMobileUi((state) => state.surface);
  const closeSurface = useMobileUi((state) => state.closeSurface);
  const user = useAuth((state) => state.user);
  const {
    publicNotes,
    tabsWithGroups,
    currentNoteId,
    isLoading,
    isError,
  } = useOpenTabs();
  const { changeCurrentNote, createNewNote } = useNotes();
  const setActiveGroup = useActiveGroup((state) => state.setActiveGroup);
  const toggleCollapseMutation = GroupMutations.toggleCollapse();
  const renameGroupMutation = GroupMutations.renameGroup();
  const deleteGroupMutation = GroupMutations.deleteGroup();
  const createGroupMutation = GroupMutations.createGroup();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editedGroupName, setEditedGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const isOpen = surface === "notes";
  const groups = tabsWithGroups?.groups ?? [];
  const ungroupedTabs = tabsWithGroups?.ungroupedTabs ?? [];

  const selectNote = (noteId: string) => {
    closeSurface();
    changeCurrentNote(noteId);
  };

  const createNote = (groupId: string | null = null) => {
    setActiveGroup(groupId);
    closeSurface();
    void createNewNote();
  };

  const startRename = (group: TabGroupWithTabs) => {
    setEditingGroupId(group.id);
    setEditedGroupName(group.name);
  };

  const commitRename = (group: TabGroupWithTabs) => {
    const name = editedGroupName.trim();
    if (name && name !== group.name) {
      renameGroupMutation.mutate({ id: group.id, name });
    }
    setEditingGroupId(null);
    setEditedGroupName("");
  };

  const deleteGroup = (group: TabGroupWithTabs) => {
    deleteGroupMutation.mutate({ id: group.id });
    if (useActiveGroup.getState().activeGroupId === group.id) {
      setActiveGroup(null);
    }
  };

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    createGroupMutation.mutate(
      { name },
      {
        onSuccess: () => {
          setIsCreatingGroup(false);
          setNewGroupName("");
        },
      },
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSurface();
      }}
    >
      <DialogContent
        id="mobile-notes-drawer"
        showCloseButton={false}
        overlayClassName="!z-[40] lg:hidden"
        className="!z-[50] !top-auto !bottom-0 !translate-y-0 max-h-[min(82dvh,720px)] max-w-none gap-0 overflow-hidden rounded-b-none p-0 sm:!max-w-[min(92vw,720px)] lg:hidden"
      >
        <DialogHeader className="flex-row items-start justify-between border-b px-4 pb-3 pt-4 text-left">
          <div>
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>Choose a note or group to open.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Close notes">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="safe-area-bottom-content min-h-0 overflow-y-auto overscroll-contain px-3 pt-2">
          {isLoading && (
            <div className="space-y-2 py-2" aria-live="polite" aria-busy="true">
              {["one", "two", "three"].map((item) => (
                <div key={item} className="h-11 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}

          {isError && !isLoading && (
            <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">
              Notes could not be loaded. Try again after reconnecting.
            </p>
          )}

          {!isLoading && !isError && (
            <div className="space-y-3">
              <section aria-labelledby="mobile-public-notes-heading">
                <div className="flex min-h-11 items-center">
                  <div className="flex min-w-0 items-center gap-2 px-2">
                    <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <h2 id="mobile-public-notes-heading" className="truncate text-sm font-medium">
                      Public
                    </h2>
                  </div>
                </div>
                {publicNotes && publicNotes.length > 0 ? (
                  <div className="space-y-1 pl-2">
                    {publicNotes.map((note) => (
                      <button
                        type="button"
                        key={note.id}
                        className={cn(
                          "flex min-h-11 w-full min-w-0 items-center rounded-md px-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          note.id === currentNoteId && "bg-accent font-medium text-foreground",
                        )}
                        aria-current={note.id === currentNoteId ? "page" : undefined}
                        onClick={() => selectNote(note.id)}
                      >
                        <span className="truncate">{note.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No public notes available.</p>
                )}
              </section>

              {user && (
                <section aria-labelledby="mobile-private-notes-heading" className="border-t pt-2">
                  <div className="flex min-h-11 items-center justify-between px-2">
                    <h2 id="mobile-private-notes-heading" className="text-sm font-medium">
                      Private
                    </h2>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Create a group"
                        onClick={() => {
                          setIsCreatingGroup(true);
                          setNewGroupName("");
                        }}
                      >
                        <FolderPlus aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Create a private note"
                        onClick={() => createNote(null)}
                      >
                        <FilePlus aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {isCreatingGroup && (
                    <form
                      className="flex items-center gap-2 px-2 pb-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        createGroup();
                      }}
                    >
                      <input
                        autoFocus
                        value={newGroupName}
                        aria-label="New group name"
                        placeholder="Group name"
                        className="h-11 min-w-0 flex-1 rounded border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(event) => setNewGroupName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setIsCreatingGroup(false);
                            setNewGroupName("");
                          }
                        }}
                      />
                      <Button
                        type="submit"
                        size="icon-lg"
                        aria-label="Save group"
                        disabled={!newGroupName.trim() || createGroupMutation.isPending}
                      >
                        <FolderPlus aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Cancel new group"
                        onClick={() => {
                          setIsCreatingGroup(false);
                          setNewGroupName("");
                        }}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </form>
                  )}

                  {groups.length === 0 && ungroupedTabs.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No groups yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {groups.map((group) => {
                        const isEditing = editingGroupId === group.id;
                        return (
                          <div key={group.id} className="rounded-md">
                            <div className="flex min-h-11 items-center gap-1">
                              {isEditing ? (
                                <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                                  {group.collapsed ? (
                                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                                  )}
                                  <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <input
                                    autoFocus
                                    value={editedGroupName}
                                    aria-label={`Rename ${group.name}`}
                                    className="h-11 min-w-0 flex-1 rounded border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onChange={(event) => setEditedGroupName(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    onBlur={() => commitRename(group)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") event.currentTarget.blur();
                                      if (event.key === "Escape") {
                                        setEditingGroupId(null);
                                        setEditedGroupName("");
                                      }
                                    }}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className={cn(
                                    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    group.tabs.some((tab) => tab.id === currentNoteId) &&
                                      "bg-accent font-medium",
                                  )}
                                  aria-expanded={!group.collapsed}
                                  onClick={() => {
                                    if (group.tabs[0]) selectNote(group.tabs[0].id);
                                    else createNote(group.id);
                                  }}
                                >
                                  {group.collapsed ? (
                                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                                  )}
                                  <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">{group.tabs.length}</span>
                                </button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-lg"
                                    aria-label={`Actions for ${group.name}`}
                                  >
                                    <MoreHorizontal aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[60] [&_[data-slot=dropdown-menu-item]]:min-h-11">
                                  <DropdownMenuItem onClick={() => createNote(group.id)}>
                                    <FilePlus aria-hidden="true" />
                                    New note
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => startRename(group)}>
                                    <Pencil aria-hidden="true" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toggleCollapseMutation.mutate({
                                        id: group.id,
                                        collapsed: !group.collapsed,
                                      })
                                    }
                                  >
                                    {group.collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                                    {group.collapsed ? "Expand" : "Collapse"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => deleteGroup(group)}
                                  >
                                    <Trash2 aria-hidden="true" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {!group.collapsed && group.tabs.length > 0 && (
                              <div className="space-y-1 pb-1 pl-8">
                                {group.tabs.map((note) => (
                                  <button
                                    type="button"
                                    key={note.id}
                                    className={cn(
                                      "flex min-h-11 w-full min-w-0 items-center rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      note.id === currentNoteId && "bg-accent text-foreground",
                                    )}
                                    aria-current={note.id === currentNoteId ? "page" : undefined}
                                    onClick={() => selectNote(note.id)}
                                  >
                                    <span className="truncate">{note.title}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {group.tabs.length === 0 && (
                              <button
                                type="button"
                                className="min-h-11 w-full rounded-md px-8 text-left text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => createNote(group.id)}
                              >
                                Add a note to this group
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {ungroupedTabs.length > 0 && (
                    <section aria-labelledby="mobile-ungrouped-notes-heading" className="border-t pt-2">
                      <h3
                        id="mobile-ungrouped-notes-heading"
                        className="px-2 pb-1 text-xs font-medium text-muted-foreground"
                      >
                        Other notes
                      </h3>
                      <div className="space-y-1">
                        {ungroupedTabs.map((note) => (
                          <button
                            type="button"
                            key={note.id}
                            className={cn(
                              "flex min-h-11 w-full min-w-0 items-center rounded-md px-3 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              note.id === currentNoteId && "bg-accent font-medium text-foreground",
                            )}
                            aria-current={note.id === currentNoteId ? "page" : undefined}
                            onClick={() => selectNote(note.id)}
                          >
                            <span className="truncate">{note.title}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                </section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileNotesDrawer;

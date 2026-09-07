import { FilePlus, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useOpenTabs } from "@/hooks/use-open-tabs";
import { useNotes } from "@/hooks/use-notes";
import { useModal } from "@/hooks/use-modal";
import { cn } from "@/lib/utils";
import type { Note } from "@/types";

const MobileTabsOverview = () => {
  const surface = useMobileUi((state) => state.surface);
  const closeSurface = useMobileUi((state) => state.closeSurface);
  const { visibleTabs, publicNoteIds, currentNoteId, isLoading, isError } = useOpenTabs();
  const { changeCurrentNote, closeNote, renameTitleNote } = useNotes();
  const openModal = useModal((state) => state.openModal);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const commitRenameRef = useRef(false);
  const isOpen = surface === "tabs";

  const selectNote = (noteId: string) => {
    closeSurface();
    changeCurrentNote(noteId);
  };

  const startRename = (note: Note) => {
    commitRenameRef.current = false;
    setEditingId(note.id);
    setEditedTitle(note.title);
  };

  const commitRename = (note: Note) => {
    if (commitRenameRef.current) return;
    commitRenameRef.current = true;
    const title = editedTitle.trim();
    if (title && title !== note.title) renameTitleNote(note.id, title);
    setEditingId(null);
    setEditedTitle("");
  };

  const requestClose = (note: Note) => {
    closeSurface();
    openModal("delete-note", {
      data: { note },
      callback: { deleteNote: closeNote },
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSurface();
      }}
    >
      <DialogContent
        id="mobile-tabs-overview"
        showCloseButton={false}
        overlayClassName="!z-[40] lg:hidden"
        className="!z-[50] !top-auto !bottom-0 !translate-y-0 max-h-[min(76dvh,640px)] max-w-none gap-0 overflow-hidden rounded-b-none p-0 sm:!max-w-[min(92vw,720px)] lg:hidden"
      >
        <DialogHeader className="flex-row items-start justify-between border-b px-4 pb-3 pt-4 text-left">
          <div>
            <DialogTitle>Open notes</DialogTitle>
            <DialogDescription>Switch, rename, or close an open note.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Close open notes">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="safe-area-bottom-content min-h-0 overflow-y-auto overscroll-contain p-3 pt-2">
          {isLoading && (
            <div className="space-y-2" aria-live="polite" aria-busy="true">
              {["one", "two", "three"].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}
          {isError && !isLoading && (
            <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">
              Open notes could not be loaded.
            </p>
          )}
          {!isLoading && !isError && visibleTabs.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <FilePlus className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No open notes yet.</p>
            </div>
          )}
          {!isLoading && !isError && visibleTabs.length > 0 && (
            <ul className="space-y-1" aria-label="Open notes">
              {visibleTabs.map((note) => {
                const isPublic = publicNoteIds.has(note.id);
                const isEditing = editingId === note.id;
                return (
                  <li key={note.id} className="flex min-h-14 items-center gap-1 rounded-md border px-2">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editedTitle}
                        aria-label={`Rename ${note.title}`}
                        className="h-11 min-w-0 flex-1 rounded border bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(event) => setEditedTitle(event.target.value)}
                        onBlur={() => commitRename(note)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            commitRenameRef.current = true;
                            setEditingId(null);
                            setEditedTitle("");
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "flex min-h-11 min-w-0 flex-1 items-center rounded px-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          note.id === currentNoteId && "font-medium text-foreground",
                        )}
                        aria-current={note.id === currentNoteId ? "page" : undefined}
                        onClick={() => selectNote(note.id)}
                      >
                        <span className="truncate">{note.title}</span>
                      </button>
                    )}
                    {!isPublic && !isEditing && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Rename ${note.title}`}
                          onClick={() => startRename(note)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Close ${note.title}`}
                          onClick={() => requestClose(note)}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileTabsOverview;

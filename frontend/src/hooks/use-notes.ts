import { queryKeys } from "@/queries";
import { useQueryClient } from "@tanstack/react-query";
import { type Note, type TabsWithGroups } from "@/types";
import { NoteMutations } from "@/queries/note-mutations";
import { useNavigate, useMatchRoute } from "@tanstack/react-router";
import { useModal } from "./use-modal";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useActiveGroup } from "./use-active-group";

export const useNotes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = NoteMutations.create();
  const deleteMutation = NoteMutations.deleteNote();
  const renameMutation = NoteMutations.renameTitle();
  const updateMutation = NoteMutations.update();
  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const currentNoteId = noteMatch ? (noteMatch as { noteId: string }).noteId : undefined;
  const { openModal, closeModal } = useModal();

  const createNewNote = async () => {
    const user = useAuth.getState().user;
    if (!user) {
      const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs) ?? [];
      if (tabs.length >= 3) {
        toast.error(
          "Guest users can only have 3 notes. Log in to create more.",
        );
        return;
      }
    }
    openModal("connection-note");
    if (createMutation.isPending) {
      return;
    }

    const activeGroupId = useActiveGroup.getState().activeGroupId;
    createMutation.mutate(
      { groupId: activeGroupId },
      {
        onSuccess: (note) => {
          closeModal();
          changeCurrentNote(note.id);
        },
        onError: (error) => {
          closeModal();
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            toast.error(
              "Guest users can only have 3 notes. Log in to create more.",
            );
          }
        },
      },
    );
  };

  const closeNote = (id: string) => {
    const notes = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    if (!notes) return;
    deleteMutation.mutate({
      id,
      onMutateFn: () => {
        if (currentNoteId == id) {
          // Read the FRESH cache — onMutate already removed the closed tab.
          // The closure `notes` is stale, so deriving the neighbor index from
          // it can pick a removed/undefined tab (caused blank strip on close).
          const current = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
          if (!current || current.length === 0) {
            // Closing the LAST open tab: land on the empty workspace instead
            // of silently doing nothing.
            navigate({ to: "/" });
            return;
          }
          // Pick the tab at the same position (or the previous one if the
          // closed tab was last), falling back to the first tab.
          const closedIdx = notes.findIndex((tab) => tab.id === id);
          const nextIdx = Math.min(closedIdx, current.length - 1);
          changeCurrentNote(current[nextIdx].id);
        }
      },
    });
  };

  const dropStaleNote = (id: string) => {
    // Local-only removal of a tab whose note no longer exists on the server
    // (deleted from another device). Mirrors deleteNote's optimistic onMutate
    // but NEVER calls the DELETE API — the note is already gone, so a DELETE
    // would 404 and the mutation's rollback would resurrect the ghost tab.
    const notes = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);

    // Flat tab strip: remove immediately.
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
      (old ?? []).filter((note) => note.id !== id),
    );

    // Sidebar groups: remove from every group + ungrouped tabs too, so the
    // tab disappears everywhere at once.
    queryClient.setQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
      (old) => {
        if (!old) return old;
        return {
          groups: old.groups.map((g) => ({
            ...g,
            tabs: g.tabs.filter((t) => t.id !== id),
          })),
          ungroupedTabs: old.ungroupedTabs.filter((t) => t.id !== id),
        };
      },
    );

    // Drop the noteById cache entry so the deleted note can't "resurrect"
    // when navigating back to its URL (ghost note bug).
    queryClient.removeQueries({ queryKey: queryKeys.notes.noteById(id) });

    if (currentNoteId == id) {
      // Read the FRESH cache — the stale tab was already removed above.
      const current = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
      if (!current || current.length === 0) {
        // Dropping the LAST open tab: land on the empty workspace instead
        // of silently doing nothing.
        navigate({ to: "/" });
        return;
      }
      // Pick the tab at the same position (or the previous one if the stale
      // tab was last), falling back to the first tab.
      const closedIdx = (notes ?? []).findIndex((tab) => tab.id === id);
      const nextIdx = Math.min(closedIdx, current.length - 1);
      changeCurrentNote(current[nextIdx].id);
    }
  };

  const updateContentNote = (updateNote: Note) => {
    updateMutation.mutate(updateNote);
  };

  const renameTitleNote = (id: string, title: string) => {
    renameMutation.mutate({ id, title });
  };

  const changeCurrentNote = (id: string) => {
    navigate({
      to: "/n/$noteId",
      params: { noteId: id },
    });

    // Keep the active group in sync with the opened tab's group membership.
    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    const tab = tabs?.find((t) => t.id === id);
    if (tab) {
      useActiveGroup.getState().setActiveGroup(tab.groupId ?? null);
    }
  };

  return {
    createNewNote,
    closeNote,
    renameTitleNote,
    updateContentNote,
    changeCurrentNote,
    dropStaleNote,
  };
};

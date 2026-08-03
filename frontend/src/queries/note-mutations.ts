import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries";
import type { Note, TabsWithGroups } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type CreateNoteContext = {
  prevTabs: Note[] | undefined;
  prevGroups: TabsWithGroups | undefined;
  optimisticNote: Note;
};

type CreateNoteParams = {
  groupId?: string | null;
};

function create() {
  return useMutation<Note, Error, CreateNoteParams, CreateNoteContext>({
    mutationFn: async ({ groupId }) => {
      const resp = await api.post("/notes", groupId ? { group_id: groupId } : {});
      return parseNote(resp.data);
    },
    onMutate: async ({ groupId }, ctx) => {
      // Cancel in-flight queries so they can't clobber the optimistic update.
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      await ctx.client.cancelQueries({ queryKey: queryKeys.tabGroups.withTabs });

      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);
      const prevGroups = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );

      const optimisticNote: Note = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "Untitled",
        content: "",
        positionAt: (prevTabs?.length ?? 0) + 1,
        groupId: groupId ?? null,
      };

      // Flat tab strip: appear immediately.
      ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
        old ? [...old, optimisticNote] : [optimisticNote],
      );

      // Sidebar: show it inside the target group (or ungrouped tabs).
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          // If the groups query was cancelled in-flight (fresh user racing
          // create-note against first /groups load) the cache is undefined —
          // seed an empty structure so the optimistic note still lands.
          const base = old ?? { groups: [], ungroupedTabs: [] };
          if (groupId) {
            return {
              ...base,
              groups: base.groups.map((g) =>
                g.id === groupId
                  ? { ...g, tabs: [...g.tabs, optimisticNote] }
                  : g,
              ),
            };
          }
          return { ...base, ungroupedTabs: [...base.ungroupedTabs, optimisticNote] };
        },
      );

      return { prevTabs, prevGroups, optimisticNote };
    },
    onSuccess: (result, _vars, onMutateResult, ctx) => {
      const tempId = onMutateResult?.optimisticNote.id;

      // Replace the temp note with the real server note in the flat tabs cache.
      ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) => {
        if (!old) return [result];
        if (tempId && old.some((t) => t.id === tempId)) {
          return old.map((t) => (t.id === tempId ? result : t));
        }
        return [...old, result];
      });

      // Replace it in the groups cache too (group tabs + ungrouped tabs).
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          const replaceIn = (tabs: Note[]) =>
            tabs.map((t) => (t.id === tempId ? result : t));
          const groups = old.groups.map((g) => ({
            ...g,
            tabs: replaceIn(g.tabs),
          }));
          const ungroupedTabs = replaceIn(old.ungroupedTabs);

          // Temp sat in ungroupedTabs but the server placed the note in a group:
          // move it from ungrouped into that group. NOTE: ungroupedTabs was
          // already replaceIn'd (temp → result) above, so filter by result.id.
          const tempWasUngrouped = old.ungroupedTabs.some((t) => t.id === tempId);
          if (tempWasUngrouped && result.groupId) {
            return {
              groups: groups.map((g) =>
                g.id === result.groupId
                  ? { ...g, tabs: [...g.tabs, result] }
                  : g,
              ),
              ungroupedTabs: ungroupedTabs.filter((t) => t.id !== result.id),
            };
          }
          return { groups, ungroupedTabs };
        },
      );

      // Refetch groups from the server so the sidebar's auto-create-General
      // effect sees the fresh ungrouped note. Without this, a fresh user who
      // creates their first note before the initial /groups load finishes
      // never triggers the auto-create (the effect only runs when
      // ungroupedTabs transitions from empty to non-empty via a refetch).
      ctx.client.invalidateQueries({ queryKey: queryKeys.tabGroups.withTabs });
    },
    onError: (_error, _vars, onMutateResult, ctx) => {
      // Roll back: remove the temp note from every cache.
      const tempId = onMutateResult?.optimisticNote.id;
      if (tempId) {
        ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
          (old ?? []).filter((t) => t.id !== tempId),
        );
        if (onMutateResult.prevGroups) {
          // Restore the pre-mutation groups cache (temp was never in it).
          ctx.client.setQueryData(
            queryKeys.tabGroups.withTabs,
            onMutateResult.prevGroups,
          );
        } else {
          // The groups query had not loaded yet (fresh-user race) — the
          // onMutate seed must be removed so a later refetch starts clean.
          ctx.client.removeQueries({ queryKey: queryKeys.tabGroups.withTabs });
        }
      }
      // Caller (use-notes) surfaces the error toast; keep this quiet here.
    },
  });
}

function update() {
  return useMutation<void, Error, Note, unknown>({
    mutationFn: async (updateNote) => {
      await api.patch(`/notes/${updateNote.id}`, {
        content: updateNote.content,
      });
      return;
    },
    onMutate: async (updateNote, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.notes.noteById(updateNote.id),
      });
      ctx.client.setQueryData(
        queryKeys.notes.noteById(updateNote.id),
        (old: Note) => ({
          ...old,
          content: updateNote.content,
        }),
      );
    },
  });
}

type RenameNoteParams = {
  id: string;
  title: string;
};

type RenameNoteContext = {
  prevTabs: Note[] | undefined;
  prevGroups: TabsWithGroups | undefined;
  prevNote: Note | undefined;
};

function renameTitle() {
  return useMutation<void, Error, RenameNoteParams, RenameNoteContext>({
    mutationFn: async ({ id, title }) => {
      await api.patch(`/notes/${id}`, { title });
      return;
    },
    onMutate: async ({ id, title }, ctx) => {
      // Cancel outgoing queries so the optimistic update isn't clobbered.
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      await ctx.client.cancelQueries({
        queryKey: queryKeys.notes.noteById(id),
      });
      await ctx.client.cancelQueries({ queryKey: queryKeys.tabGroups.withTabs });

      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);
      const prevGroups = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      const prevNote = ctx.client.getQueryData<Note>(
        queryKeys.notes.noteById(id),
      );

      // Update the tabs list with the new title
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((note) => (note.id === id ? { ...note, title } : note)),
      );

      // Update the sidebar groups cache too (group tabs + ungrouped tabs),
      // so tab strip and sidebar never show different titles after a rename.
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          const renameIn = (tabs: Note[]) =>
            tabs.map((t) => (t.id === id ? { ...t, title } : t));
          return {
            groups: old.groups.map((g) => ({ ...g, tabs: renameIn(g.tabs) })),
            ungroupedTabs: renameIn(old.ungroupedTabs),
          };
        },
      );

      // Update the specific note cache if it exists
      ctx.client.setQueryData(
        queryKeys.notes.noteById(id),
        (old: Note | undefined) => {
          if (!old) return old;
          return { ...old, title };
        },
      );

      return { prevTabs, prevGroups, prevNote };
    },
    onError: (_error, { id, title }, context, ctx) => {
      // Roll back every cache the optimistic update touched.
      if (context?.prevTabs) {
        ctx.client.setQueryData(queryKeys.notes.tabs, context.prevTabs);
      }
      if (context?.prevGroups) {
        ctx.client.setQueryData(
          queryKeys.tabGroups.withTabs,
          context.prevGroups,
        );
      }
      if (context?.prevNote) {
        ctx.client.setQueryData(
          queryKeys.notes.noteById(id),
          context.prevNote,
        );
      }
      toast.error(`Failed to rename note to "${title}"`);
    },
    onSuccess: (_result, _vars, _onMutateResult, ctx) => {
      // Ctrl+K search results cache the old title — force a refetch so a
      // renamed note stops showing its stale name in the search modal.
      ctx.client.invalidateQueries({ queryKey: queryKeys.notes.searchAll });
    },
  });
}

type DeleteNoteContext = {
  prevTabs: Note[] | undefined;
  prevGroups: TabsWithGroups | undefined;
  id: string;
};

type DeleteNoteParams = {
  id: string;
  onMutateFn?: () => void;
};

function deleteNote() {
  return useMutation<void, Error, DeleteNoteParams, DeleteNoteContext>({
    mutationFn: async ({ id }) => {
      await api.delete(`/notes/${id}`);
      return;
    },
    onMutate: async ({ id, onMutateFn }, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      await ctx.client.cancelQueries({ queryKey: queryKeys.tabGroups.withTabs });

      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);
      const prevGroups = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );

      // Flat tab strip: remove immediately.
      ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
        (old ?? []).filter((note) => note.id !== id),
      );

      // Sidebar groups: remove from every group + ungrouped tabs too,
      // so the tab disappears everywhere at once.
      ctx.client.setQueryData<TabsWithGroups>(
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

      onMutateFn?.();

      return { prevTabs, prevGroups, id };
    },
    onError: (_error, _vars, onMutateResult, ctx) => {
      if (!onMutateResult) return;
      // Restore both caches so the tab comes back if the delete fails.
      if (onMutateResult.prevTabs) {
        ctx.client.setQueryData(queryKeys.notes.tabs, onMutateResult.prevTabs);
      }
      if (onMutateResult.prevGroups) {
        ctx.client.setQueryData(
          queryKeys.tabGroups.withTabs,
          onMutateResult.prevGroups,
        );
      }
      toast.error(`Failed to delete note ${onMutateResult.id}`);
    },
    onSuccess: (_result, { id }, _onMutateResult, ctx) => {
      // Drop the noteById cache entry so a deleted note can't "resurrect"
      // when navigating back to its URL (ghost note bug).
      ctx.client.removeQueries({ queryKey: queryKeys.notes.noteById(id) });
      // Refetch groups/tabs so the tab strip and sidebar reflect server truth.
      ctx.client.invalidateQueries({ queryKey: queryKeys.tabGroups.withTabs });
      // Search results must not show the deleted note.
      ctx.client.invalidateQueries({ queryKey: queryKeys.notes.searchAll });
    },
    retry: 5,
  });
}

type UpdateTabPositionParams = {
  id: string;
  positionAt: number;
};

function updateTabPosition() {
  return useMutation<void, Error, UpdateTabPositionParams>({
    mutationFn: async ({ id, positionAt }) => {
      await api.patch(`/notes/tabs/${id}`, { position_at: positionAt });
    },
    onSuccess: (_result, _vars, _context, ctx) => {
      // The tab strip reorders the flat tabs cache optimistically, but the
      // sidebar renders from the groups cache — refetch it so group tab
      // order stays in sync after a drag-reorder.
      ctx.client.invalidateQueries({ queryKey: queryKeys.tabGroups.withTabs });
    },
    onError: () => {
      toast.error("Failed to reorder tabs");
    },
  });
}

export const NoteMutations = {
  renameTitle,
  deleteNote,
  create,
  update,
  updateTabPosition,
};

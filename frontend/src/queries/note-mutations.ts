import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries";
import type { Note, TabsWithGroups } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type CreateNoteContext = {
  prevTabs: Note[] | undefined;
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
    onSuccess: (result, vars, _onMutateResult, ctx) => {
      const { groupId } = vars;
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) => {
        if (!old) return [result];
        return [...old, result];
      });
      // Also show the new tab inside its group in the sidebar.
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old || !groupId) return old;
          return {
            ...old,
            groups: old.groups.map((g) =>
              g.id === groupId ? { ...g, tabs: [...g.tabs, result] } : g,
            ),
          };
        },
      );
    },
    onError: (_error, _variables, onMutateResult, ctx) => {
      
      if (!onMutateResult?.optimisticNote) return;
      const errorNote: Note = {
        ...onMutateResult?.optimisticNote,
        title: "[Error create note]",
      };
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((tab) =>
          tab.id === onMutateResult.optimisticNote.id ? errorNote : old,
        ),
      );
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

function renameTitle() {
  return useMutation<void, Error, RenameNoteParams, unknown>({
    mutationFn: async ({ id, title }) => {
      await api.patch(`/notes/${id}`, { title });
      return;
    },
    onMutate: async ({ id, title }, ctx) => {
      // Cancel outgoing queries for both tabs and the specific note
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      await ctx.client.cancelQueries({
        queryKey: queryKeys.notes.noteById(id),
      });

      // Update the tabs list with the new title
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((note) => (note.id === id ? { ...note, title } : note)),
      );

      // Update the specific note cache if it exists
      ctx.client.setQueryData(
        queryKeys.notes.noteById(id),
        (old: Note | undefined) => {
          if (!old) return old;
          return { ...old, title };
        },
      );
    },
    onError: (_error, { title }) => {
      toast.error(`Failed to rename note to "${title}"`);
    },
  });
}

type DeleteNoteContenxt = {
  prevTabs: Note[] | undefined;
  id: string;
};

type DeleteNoteParams = {
  id: string;
  onMutateFn?: () => void;
};

function deleteNote() {
  return useMutation<void, Error, DeleteNoteParams, DeleteNoteContenxt>({
    mutationFn: async ({ id }) => {
      await api.delete(`/notes/${id}`);
      return;
    },
    onMutate: async ({ id, onMutateFn }, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);

      if (!prevTabs || (prevTabs && prevTabs.length <= 1))
        return { prevTabs, id };

      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.filter((note) => note.id !== id),
      );
      onMutateFn?.();

      return { prevTabs, id };
    },
    onError: (_error, _vars, onMutateResult) => {
      if (!onMutateResult?.prevTabs) return;
      // ctx.client.setQueryData(queryKeys.notes.tabs, onMutateResult.prevTabs);
      toast.warning(`Retrying delete note ${onMutateResult.id}`);
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

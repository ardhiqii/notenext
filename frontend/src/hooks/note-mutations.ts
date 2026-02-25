import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries";
import type { Note } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";

type CreateNoteContext = {
  prevTabs: Note[] | undefined;
  optimisticNote: Note;
};

function create() {
  return useMutation<Note, Error, void, CreateNoteContext>({
    mutationFn: async () => {
      const resp = await api.post("/notes");
      return parseNote(resp.data);
    },
    onMutate: async (_newNote, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);

      const optimisticNote: Note = {
        id: `temp-${uuid()}`,
        title: `New note`,
        content: "",
        positionAt: Date.now() + 1,
      };
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) => [
        ...old,
        optimisticNote,
      ]);

      // Set current note id for new note with temp note
      // setCurrentNoteId(optimisticNote.id);
      return { prevTabs, optimisticNote };
    },
    onSuccess: (result, _vars, onMutateResult, ctx) => {
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((tab) =>
          tab.id === onMutateResult.optimisticNote.id ? result : tab,
        ),
      );
      // Set current new note id
      // setCurrentNoteId(result.id);
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

function deleteNote() {
  return useMutation<void, Error, string, DeleteNoteContenxt>({
    mutationFn: async (id: string) => {
      await api.delete(`/notes/${id}`);
      return;
    },
    onMutate: async (id, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);

      if (!prevTabs || (prevTabs && prevTabs.length <= 1))
        return { prevTabs, id };

      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.filter((note) => note.id !== id),
      );

      // change current note id after deleted a note
      // const currentIdx = prevTabs.findIndex((tab) => tab.id == id);
      // const nextIdx =
      //   currentIdx === prevTabs.length - 1 ? currentIdx - 1 : currentIdx + 1;
      // setCurrentNoteId(prevTabs[nextIdx].id);

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

export const NoteMutations = {
  renameTitle,
  deleteNote,
  create,
  update,
};

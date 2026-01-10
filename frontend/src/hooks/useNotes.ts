import { useState, useEffect } from "react";
import { queryKeys } from "@/queries";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { type Note } from "@/types";
import { v4 as uuid } from "uuid";
import { parseNote } from "@/lib/utils";

export const useNotes = () => {
  const [currentNoteId, setCurrentNoteId] = useState<string>("");

  const { data: tabs = [], isSuccess } = useQuery<Note[]>({
    queryKey: queryKeys.notes.tabs,
    queryFn: async () => {
      const resp = await api.get("/notes?only_tabs=true");
      return resp.data.map(parseNote);
    },
    refetchOnWindowFocus: false,
  });

  const { data: currentNote = null } = useQuery<Note | null>({
    queryKey: queryKeys.notes.noteById(currentNoteId ?? ""),
    queryFn: async () => {
      if (!currentNoteId) return null;
      const resp = await api.get(`/notes/${currentNoteId}`);
      return parseNote(resp.data);
    },
  });

  // Only fetch current note + prefetch adjacent tabs
  const currentIndex = tabs.findIndex((t) => t.id === currentNoteId);
  const adjacentTabs = [tabs[currentIndex - 1], tabs[currentIndex + 1]].filter(
    Boolean
  );

  useQueries({
    queries: adjacentTabs.map((tab) => ({
      queryKey: queryKeys.notes.noteById(tab.id),
      queryFn: async () => {
        const resp = await api.get(`/notes/${tab.id}`); // Fix: use tab.id not currentNoteId
        return parseNote(resp.data);
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  type CreateNoteContext = {
    prevTabs: Note[] | undefined;
    optimisticNote: Note;
  };

  const createNoteMutation = useMutation<Note, Error, void, CreateNoteContext>({
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

      // Set current note id
      setCurrentNoteId(optimisticNote.id);
      return { prevTabs, optimisticNote };
    },
    onSuccess: (result, _vars, onMutateResult, ctx) => {
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((tab) =>
          tab.id === onMutateResult.optimisticNote.id ? result : tab
        )
      );
      setCurrentNoteId(result.id);
    },
    onError: (_error, _variables, onMutateResult, ctx) => {
      if (!onMutateResult?.optimisticNote) return;
      const errorNote: Note = {
        ...onMutateResult?.optimisticNote,
        title: "[Error create note]",
      };
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((tab) =>
          tab.id === onMutateResult.optimisticNote.id ? errorNote : old
        )
      );
    },
  });

  type DeleteNoteContext = {
    prevTabs: Note[] | undefined;
    id: string;
  };

  const deleteNoteMutation = useMutation<
    void,
    Error,
    string,
    DeleteNoteContext
  >({
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
        old.filter((note) => note.id !== id)
      );

      // change current note id
      const currentIdx = prevTabs.findIndex((tab) => tab.id == id);
      const nextIdx =
        currentIdx === prevTabs.length - 1 ? currentIdx - 1 : currentIdx + 1;
      setCurrentNoteId(prevTabs[nextIdx].id);

      return { prevTabs, id };
    },
    onError: (_error, _vars, onMutateResult, ctx) => {
      if (!onMutateResult?.prevTabs) return;
      ctx.client.setQueryData(queryKeys.notes.tabs, onMutateResult.prevTabs);
    },
  });

  useEffect(() => {
    if (isSuccess && tabs.length > 0 && !currentNoteId) {
      setCurrentNoteId(tabs[0].id);
    }
  }, [isSuccess, tabs?.length, currentNoteId]);

  const createNewNote = () => {
    if (createNoteMutation.isPending) {
      return;
    }
    createNoteMutation.mutate();
  };

  const closeNote = () => {
    if (!tabs || tabs.length <= 1 || !currentNoteId) return;
    deleteNoteMutation.mutate(currentNoteId);
  };

  const renameNote = () => {};

  return {
    tabs,
    currentNote,
    createNewNote,
    currentNoteId,
    setCurrentNoteId,
    closeNote,
    renameNote,
  };
};

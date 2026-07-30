import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";
import type { Note } from "@/types";
import { queryOptions } from "@tanstack/react-query";

const getAllNoteOnlyTitle = queryOptions<Note[]>({
  queryKey: queryKeys.notes.tabs,
  queryFn: async () => {
    const resp = await api.get("/notes?only_tabs=true");
    return resp.data.map(parseNote);
  },
  // Refetch when auth state changes (user logs in/out)
  staleTime: 0,
});

const getCurrentNoteById = (id:string) => queryOptions<Note>({
  queryKey: queryKeys.notes.noteById(id ?? ""),
  queryFn: async () => {
    const resp = await api.get(`/notes/${id}`);
    return parseNote(resp.data);
  },
  staleTime: 0,
});

export const NoteQueryOptions = {
  getAllNoteOnlyTitle,
  getCurrentNoteById
};

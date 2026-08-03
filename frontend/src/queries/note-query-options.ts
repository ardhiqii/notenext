import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";
import type { Note, SearchNoteResult } from "@/types";
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

// Public/global seeded notes — shown in the sidebar for everyone,
// including logged-in users. No auth needed.
const getPublicNotes = queryOptions<Note[]>({
  queryKey: queryKeys.notes.public,
  queryFn: async () => {
    const resp = await api.get("/notes/public");
    return resp.data.map(parseNote);
  },
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

// Server-side search across note titles + content (GET /notes/search?q=...).
// The backend already filters + dedupes, so results are returned as-is.
const searchNotes = (q: string) =>
  queryOptions<SearchNoteResult[]>({
    queryKey: queryKeys.notes.search(q),
    queryFn: async () => {
      const resp = await api.get(`/notes/search?q=${encodeURIComponent(q)}`);
      return resp.data;
    },
    staleTime: 0,
  });

export const NoteQueryOptions = {
  getAllNoteOnlyTitle,
  getPublicNotes,
  getCurrentNoteById,
  searchNotes,
};

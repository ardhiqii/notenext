import type { User } from "@/types";
import { NoteQueryOptions } from "./note-query-options";
import { PublicNoteQueryOptions } from "./public-note-query-options";

export * from "./keys";

export const smartNoteOptions = {
  getAllNoteOnlyTitle: (user: User | null) =>
    user
      ? NoteQueryOptions.getAllNoteOnlyTitle
      : PublicNoteQueryOptions.getAllNoteOnlyTitle,
  getCurrentNoteById: (user: User | null, id: string) =>
    user
      ? NoteQueryOptions.getCurrentNoteById(id)
      : PublicNoteQueryOptions.getCurrentNoteById(id),
};

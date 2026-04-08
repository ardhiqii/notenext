import { NoteQueryOptions } from "@/queries/note-query-options";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStoreNoteId } from "@/lib/local-storage";
import { useAuth } from "@/hooks/use-auth";
import { PublicNoteQueryOptions } from "@/queries/public-note-query-options";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const user = useAuth.getState().user;
    const queryClient = context.queryClient;
    const notes = await queryClient.ensureQueryData(
      user
        ? NoteQueryOptions.getAllNoteOnlyTitle
        : PublicNoteQueryOptions.getAllNoteOnlyTitle,
    );
    let targetId: string;
    if (notes.length > 0) {
      const lastNoteId = getStoreNoteId();
      targetId =
        lastNoteId && notes.some((n) => n.id === lastNoteId)
          ? lastNoteId
          : notes[0].id;
    } else {
      const resp = await api.post("/me/notes");
      const newNote = parseNote(resp.data);
      queryClient.setQueryData(queryKeys.notes.tabs, [newNote]);
      targetId = newNote.id;
    }
    if (targetId !== "") {
      throw redirect({
        to: "/n/$noteId",
        params: { noteId: targetId },
      });
    }
  },
});

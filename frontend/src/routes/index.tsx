import { NoteQueryOptions } from "@/hooks/note-query-options";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const queryClient = context.queryClient;

    const notes = await queryClient.ensureQueryData(
      NoteQueryOptions.getAllNoteOnlyTitle,
    );
    if (notes.length > 0) {
      throw redirect({
        to: "/n/$noteId",
        params: { noteId: notes[0].id },
      });
    }
  },
});

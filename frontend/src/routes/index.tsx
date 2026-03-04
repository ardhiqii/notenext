import { NoteQueryOptions } from "@/hooks/note-query-options";
import { useNotes } from "@/hooks/use-notes";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getStoreNoteId } from "@/lib/local-storage";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const queryClient = context.queryClient;

    const notes = await queryClient.ensureQueryData(
      NoteQueryOptions.getAllNoteOnlyTitle,
    );

    if (notes.length > 0) {
      const lastNoteId = getStoreNoteId();
      const targetId =
        lastNoteId && notes.some((n) => n.id === lastNoteId)
          ? lastNoteId
          : notes[0].id;

      throw redirect({
        to: "/n/$noteId",
        params: { noteId: targetId },
      });
    }
  },
  component: InitNoteView,
});

function InitNoteView() {
  const { createNewNote } = useNotes();

  useEffect(() => {
    createNewNote();
  }, []);

  return (
    <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Creating note...</span>
    </div>
  );
}

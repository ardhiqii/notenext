import NoteEditor from "@/components/note-editor";
import { NoteQueryOptions } from "@/hooks/note-query-options";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/n/$noteId")({
  loader: async ({ context, params }) => {
    const noteId = params.noteId;
    return context.queryClient.ensureQueryData(
      NoteQueryOptions.getCurrentNoteById(noteId),
    );
  },
  component: NoteComponent,
});

function NoteComponent() {
  const noteId = Route.useParams().noteId;
  const { data: note } = useQuery(NoteQueryOptions.getCurrentNoteById(noteId));
  if (!note) return;
  return <NoteEditor currentNote={note} />;
}

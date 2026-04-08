import NoteEditor from "@/components/note-editor";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { setStoreNoteId } from "@/lib/local-storage";
import { useAuth } from "@/hooks/use-auth";
import { PublicNoteQueryOptions } from "@/queries/public-note-query-options";

export const Route = createFileRoute("/n/$noteId")({
  loader: async ({ context, params }) => {
    const noteId = params.noteId;
    const user = useAuth.getState().user;
    return context.queryClient.ensureQueryData(
      user
        ? NoteQueryOptions.getCurrentNoteById(noteId)
        : PublicNoteQueryOptions.getCurrentNoteById(noteId),
    );
  },
  component: NoteComponent,
});

function NoteComponent() {
  const noteId = Route.useParams().noteId;
  const user = useAuth((state) => state.user);
  console.log("USER,",user);
  const { data: note } = useQuery(
    user
      ? NoteQueryOptions.getCurrentNoteById(noteId)
      : PublicNoteQueryOptions.getCurrentNoteById(noteId),
  );

  useEffect(() => {
    setStoreNoteId(noteId);
  }, [noteId]);

  if (!note) return;
  return <NoteEditor currentNote={note} />;
}

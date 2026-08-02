import NoteEditor from "@/components/note-editor";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { setStoreNoteId } from "@/lib/local-storage";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNotes } from "@/hooks/use-notes";
import { useEditorSettings } from "@/hooks/use-editor-settings";
import axios from "axios";

export const Route = createFileRoute("/n/$noteId")({
  loader: async ({ context, params }) => {
    const noteId = params.noteId;
    try {
      return await context.queryClient.ensureQueryData(
        NoteQueryOptions.getCurrentNoteById(noteId),
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw redirect({
          to: "/",
        });
      }
      throw error;
    }
  },
  errorComponent: () => (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      Couldn't load this note.
    </div>
  ),
  component: NoteComponent,
});

function NoteComponent() {
  const noteId = Route.useParams().noteId;
  const { data: note } = useQuery(NoteQueryOptions.getCurrentNoteById(noteId));
  const { closeNote } = useNotes();
  const { toggleWordWrap } = useEditorSettings();

  useHotkey("Mod+Alt+Z", toggleWordWrap);
  useHotkey("Mod+Alt+W", () => {
    closeNote(noteId);
  });

  useEffect(() => {
    setStoreNoteId(noteId);
  }, [noteId]);

  if (!note) return;
  return <NoteEditor currentNote={note} />;
}

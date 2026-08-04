import { NoteQueryOptions } from "@/queries/note-query-options";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStoreNoteId } from "@/lib/local-storage";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import { queryKeys } from "@/queries";

export const Route = createFileRoute("/_app/")({
  loader: async ({ context }) => {
    const queryClient = context.queryClient;
    const notes = await queryClient.ensureQueryData(
      NoteQueryOptions.getAllNoteOnlyTitle,
    );
    let targetId: string;
    if (notes.length > 0) {
      const lastNoteId = getStoreNoteId();
      targetId =
        lastNoteId && notes.some((n) => n.id === lastNoteId)
          ? lastNoteId
          : notes[0].id;
    } else {
      const resp = await api.post("/notes");
      const newNote = parseNote(resp.data);
      queryClient.setQueryData(queryKeys.notes.tabs, [newNote]);
      // The sidebar's groups query may have already resolved BEFORE this
      // first note existed, leaving it stale (no ungrouped tabs). Invalidate
      // so the auto-create-General effect fires and the note gets a group.
      queryClient.invalidateQueries({ queryKey: queryKeys.tabGroups.withTabs });
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

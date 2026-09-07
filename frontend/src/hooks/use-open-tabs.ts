import { useQuery } from "@tanstack/react-query";
import { useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "./use-auth";
import { GroupQueryOptions } from "@/queries/group-query-options";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { computeVisibleTabs } from "@/lib/tab-utils";
import type { Note } from "@/types";

/**
 * Shared active-scope model for the desktop strip and compact tab overview.
 * The URL remains the source of truth for the active note.
 */
export function useOpenTabs() {
  const user = useAuth((state) => state.user);
  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const currentNoteId = noteMatch
    ? (noteMatch as { noteId: string }).noteId
    : undefined;

  const notesQuery = useQuery(NoteQueryOptions.getAllNoteOnlyTitle);
  const publicNotesQuery = useQuery(NoteQueryOptions.getPublicNotes);
  const groupsQuery = useQuery({
    ...GroupQueryOptions.getGroupsWithTabs,
    enabled: !!user,
  });

  const collapsedGroupIds = useMemo(
    () =>
      new Set(
        (groupsQuery.data?.groups ?? [])
          .filter((group) => group.collapsed)
          .map((group) => group.id),
      ),
    [groupsQuery.data?.groups],
  );

  const visibleTabs = useMemo(
    () =>
      computeVisibleTabs(
        notesQuery.data,
        publicNotesQuery.data,
        collapsedGroupIds,
        currentNoteId,
      ),
    [
      notesQuery.data,
      publicNotesQuery.data,
      collapsedGroupIds,
      currentNoteId,
    ],
  );

  const publicNoteIds = useMemo(
    () => new Set((publicNotesQuery.data ?? []).map((note) => note.id)),
    [publicNotesQuery.data],
  );

  return {
    currentNoteId,
    notes: notesQuery.data,
    publicNotes: publicNotesQuery.data,
    tabsWithGroups: groupsQuery.data,
    visibleTabs,
    publicNoteIds,
    isLoading:
      notesQuery.isLoading ||
      publicNotesQuery.isLoading ||
      groupsQuery.isLoading,
    isError: notesQuery.isError || publicNotesQuery.isError || groupsQuery.isError,
    isSuccess: notesQuery.isSuccess,
  };
}

export type OpenTabsModel = ReturnType<typeof useOpenTabs> & {
  visibleTabs: Note[];
};

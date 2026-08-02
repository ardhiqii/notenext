import type { Note } from "@/types";

/**
 * Computes the flat tab strip shown in the TabsBar:
 * user tabs (minus tabs whose group is collapsed) plus the currently-open
 * public note (if any).
 *
 * A public note that already appears among the user tabs — e.g. for guests,
 * where the backend `GET /notes?only_tabs=true` already returns the
 * global/public notes — is NOT added a second time, so it shows exactly once.
 */
export function computeVisibleTabs(
  notes: Note[] | null | undefined,
  publicNotes: Note[] | null | undefined,
  collapsedGroupIds: ReadonlySet<string>,
  currentNoteId?: string,
): Note[] {
  const userTabs = (notes ?? []).filter(
    (t) => !(t.groupId && collapsedGroupIds.has(t.groupId)),
  );

  const currentPublicNote = (publicNotes ?? []).find(
    (p) => p.id === currentNoteId,
  );

  // Only prepend the open public note when it isn't already in the tab
  // strip (guests already get public notes from the backend).
  if (
    currentPublicNote &&
    !userTabs.some((t) => t.id === currentPublicNote.id)
  ) {
    return [currentPublicNote, ...userTabs];
  }

  return userTabs;
}

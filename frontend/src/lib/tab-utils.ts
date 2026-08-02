import type { Note } from "@/types";

/**
 * Computes the flat tab strip shown in the TabsBar.
 *
 * The strip is scoped to the group of the currently-open note:
 * - viewing a public note  → public tabs only
 * - viewing a note in a private group → that group's tabs only
 * - viewing an ungrouped note → all ungrouped tabs
 * - no note open → all user tabs minus collapsed groups (fallback)
 */
export function computeVisibleTabs(
  notes: Note[] | null | undefined,
  publicNotes: Note[] | null | undefined,
  collapsedGroupIds: ReadonlySet<string>,
  currentNoteId?: string,
): Note[] {
  const allNotes = notes ?? [];
  const publics = publicNotes ?? [];

  // No note open yet — fall back to all user tabs minus collapsed groups.
  if (!currentNoteId) {
    return allNotes.filter(
      (t) => !(t.groupId && collapsedGroupIds.has(t.groupId)),
    );
  }

  // Viewing a public note → the strip shows public tabs only.
  if (publics.some((p) => p.id === currentNoteId)) {
    return publics;
  }

  const current = allNotes.find((n) => n.id === currentNoteId);

  // Viewing a grouped private note → that group's tabs only.
  // Collapse does not empty the strip for the group you are actually in.
  if (current?.groupId) {
    return allNotes.filter((t) => t.groupId === current.groupId);
  }

  // Viewing an ungrouped note → all ungrouped tabs.
  return allNotes.filter((t) => !t.groupId);
}

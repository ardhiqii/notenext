import { describe, expect, it } from "vitest";
import { computeVisibleTabs } from "../tab-utils";
import type { Note } from "@/types";

function makeNote(
  id: string,
  overrides: Partial<Note> = {},
): Note {
  return {
    id,
    title: `Note ${id}`,
    content: "",
    positionAt: 1,
    groupId: null,
    ...overrides,
  };
}

describe("computeVisibleTabs", () => {
  it("guest: does NOT duplicate a public note already present in notes", () => {
    // Guests get the global/public notes straight from GET /notes?only_tabs=true,
    // so the same note also arrives via publicNotes — it must show exactly once.
    const welcome = makeNote("welcome");
    const notes = [welcome, makeNote("n2")];
    const publicNotes = [welcome, makeNote("about")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "welcome");

    expect(result).toHaveLength(2);
    expect(result.filter((t) => t.id === "welcome")).toHaveLength(1);
    expect(result.map((t) => t.id)).toEqual(["welcome", "n2"]);
  });

  it("guest: prepends a public note that is NOT already in notes", () => {
    const notes = [makeNote("n1"), makeNote("n2")];
    const publicNotes = [makeNote("welcome"), makeNote("about")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "welcome");

    expect(result.map((t) => t.id)).toEqual(["welcome", "n1", "n2"]);
  });

  it("logged-in user: current private note keeps only user tabs (no public notes added)", () => {
    const notes = [makeNote("n1"), makeNote("n2")];
    const publicNotes = [makeNote("welcome"), makeNote("about")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "n1");

    expect(result.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("logged-in user: current public note appears at front followed by user tabs", () => {
    const notes = [makeNote("n1"), makeNote("n2")];
    const publicNotes = [makeNote("welcome"), makeNote("about")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "about");

    expect(result.map((t) => t.id)).toEqual(["about", "n1", "n2"]);
  });

  it("filters out tabs whose group is collapsed", () => {
    const notes = [
      makeNote("n1"),
      makeNote("n2", { groupId: "g1" }),
      makeNote("n3", { groupId: "g2" }),
      makeNote("n4", { groupId: "g1" }),
    ];
    const collapsed = new Set(["g1"]);

    const result = computeVisibleTabs(notes, [], collapsed, "n1");

    expect(result.map((t) => t.id)).toEqual(["n1", "n3"]);
  });

  it("collapsed-group filter still applies when a public note is prepended", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g1" }),
      makeNote("n3"),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(
      notes,
      publicNotes,
      new Set(["g1"]),
      "welcome",
    );

    expect(result.map((t) => t.id)).toEqual(["welcome", "n3"]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(computeVisibleTabs([], [], new Set(), undefined)).toEqual([]);
    expect(computeVisibleTabs(undefined, undefined, new Set(), undefined)).toEqual(
      [],
    );
    expect(computeVisibleTabs(null, null, new Set(), "welcome")).toEqual([]);
  });

  it("does not pin any public note when currentNoteId is undefined", () => {
    const notes = [makeNote("n1")];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), undefined);

    expect(result.map((t) => t.id)).toEqual(["n1"]);
  });

  it("does not pin a public note when a different note is currently open", () => {
    const notes = [makeNote("n1"), makeNote("n2")];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "n1");

    expect(result.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("still prepends the current public note even if its own group is collapsed", () => {
    // The collapsed-group filter only applies to user tabs; the open public
    // note stays pinned (existing behavior).
    const notes = [makeNote("n1", { groupId: "g1" })];
    const publicNotes = [makeNote("welcome", { groupId: "g2" })];

    const result = computeVisibleTabs(
      notes,
      publicNotes,
      new Set(["g1", "g2"]),
      "welcome",
    );

    expect(result.map((t) => t.id)).toEqual(["welcome"]);
  });

  it("preserves the original user-tab order", () => {
    const notes = [
      makeNote("a"),
      makeNote("b"),
      makeNote("c", { groupId: "g1" }),
      makeNote("d"),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(
      notes,
      publicNotes,
      new Set(["g1"]),
      "welcome",
    );

    expect(result.map((t) => t.id)).toEqual(["welcome", "a", "b", "d"]);
  });
});

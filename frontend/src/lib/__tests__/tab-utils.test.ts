import { describe, expect, it } from "vitest";
import { computeVisibleTabs } from "../tab-utils";
import type { Note } from "@/types";

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
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
  it("guest: viewing a public note shows public tabs only, no duplicates", () => {
    // Guests get the global/public notes straight from GET /notes?only_tabs=true,
    // so the same note also arrives via publicNotes — the strip must be scoped
    // to public notes and never show a note twice.
    const welcome = makeNote("welcome");
    const about = makeNote("about");
    const notes = [welcome, makeNote("n2")];
    const publicNotes = [welcome, about];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "welcome");

    expect(result.map((t) => t.id)).toEqual(["welcome", "about"]);
  });

  it("guest: viewing any public note keeps the public-only scope", () => {
    const notes = [makeNote("welcome"), makeNote("about")];
    const publicNotes = [makeNote("welcome"), makeNote("about"), makeNote("n3")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "about");

    expect(result.map((t) => t.id)).toEqual(["welcome", "about", "n3"]);
  });

  it("logged-in user: viewing a grouped private note shows only that group's tabs", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g1" }),
      makeNote("other", { groupId: "g2" }),
      makeNote("ungrouped"),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "n1");

    expect(result.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("logged-in user: group scope uses the CURRENT note's group, not the first group", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g1" }),
      makeNote("other", { groupId: "g2" }),
      makeNote("other2", { groupId: "g2" }),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "other2");

    expect(result.map((t) => t.id)).toEqual(["other", "other2"]);
  });

  it("logged-in user: viewing an ungrouped note shows all ungrouped tabs", () => {
    const notes = [
      makeNote("u1"),
      makeNote("u2"),
      makeNote("g1", { groupId: "g1" }),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "u1");

    expect(result.map((t) => t.id)).toEqual(["u1", "u2"]);
  });

  it("logged-in user: viewing a public note shows public tabs only (no private mixed in)", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g1" }),
    ];
    const publicNotes = [makeNote("welcome"), makeNote("about")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "about");

    expect(result.map((t) => t.id)).toEqual(["welcome", "about"]);
  });

  it("collapse does not empty the strip for the group you are actually in", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g1" }),
      makeNote("other", { groupId: "g2" }),
    ];
    const publicNotes: Note[] = [];

    const result = computeVisibleTabs(notes, publicNotes, new Set(["g1"]), "n1");

    expect(result.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("collapse filters OTHER groups' tabs when no note is open (fallback)", () => {
    const notes = [
      makeNote("n1", { groupId: "g1" }),
      makeNote("n2", { groupId: "g2" }),
      makeNote("n3", { groupId: "g1" }),
    ];
    const publicNotes: Note[] = [];

    const result = computeVisibleTabs(notes, publicNotes, new Set(["g1"]), undefined);

    expect(result.map((t) => t.id)).toEqual(["n2"]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(computeVisibleTabs([], [], new Set(), undefined)).toEqual([]);
    expect(computeVisibleTabs(undefined, undefined, new Set(), undefined)).toEqual(
      [],
    );
    expect(computeVisibleTabs(null, null, new Set(), "welcome")).toEqual([]);
  });

  it("no note open falls back to all user tabs minus collapsed groups", () => {
    const notes = [
      makeNote("a"),
      makeNote("b", { groupId: "g1" }),
      makeNote("c", { groupId: "g2" }),
    ];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(["g1"]), undefined);

    expect(result.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("unknown current note id (not found anywhere) falls back to ungrouped scope", () => {
    const notes = [makeNote("n1", { groupId: "g1" }), makeNote("u1")];
    const publicNotes = [makeNote("welcome")];

    const result = computeVisibleTabs(notes, publicNotes, new Set(), "ghost");

    expect(result.map((t) => t.id)).toEqual(["u1"]);
  });
});

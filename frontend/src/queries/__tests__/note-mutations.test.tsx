import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryKeys } from "@/queries";
import { NoteMutations } from "@/queries/note-mutations";
import { createTestQueryClient } from "@/test/test-utils";
import type { Note, TabsWithGroups } from "@/types";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function seedWithTabs(queryClient: QueryClient, data: TabsWithGroups) {
  queryClient.setQueryData<TabsWithGroups>(queryKeys.tabGroups.withTabs, data);
}

const createNoteResponse = {
  data: {
    id: "n1",
    title: "Untitled",
    content: "",
    position_at: 1,
    group_id: "g1",
  },
  message: "Note created",
};

const groupWork = {
  id: "g1",
  name: "Work",
  positionAt: 1,
  collapsed: false,
  tabs: [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
  ],
};

const groupPersonal = {
  id: "g2",
  name: "Personal",
  positionAt: 2,
  collapsed: false,
  tabs: [],
};

describe("create note", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("posts /notes with group_id when groupId is passed", async () => {
    vi.mocked(api.post).mockResolvedValue(createNoteResponse as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "g1" });
    });

    expect(api.post).toHaveBeenCalledWith("/notes", { group_id: "g1" });
  });

  it("posts /notes with an empty body when no groupId is passed", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ...createNoteResponse.data, group_id: null },
    } as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: null });
    });

    expect(api.post).toHaveBeenCalledWith("/notes", {});
  });

  it("appends the new tab to its group in the groups cache on success", async () => {
    vi.mocked(api.post).mockResolvedValue(createNoteResponse as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "g1" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    const work = cache?.groups.find((g) => g.id === "g1");
    expect(work?.tabs.map((t) => t.id)).toEqual(["t1", "n1"]);
    expect(work?.tabs[1]?.groupId).toBe("g1");
    const personal = cache?.groups.find((g) => g.id === "g2");
    expect(personal?.tabs).toHaveLength(0);
  });

  it("the appended tab has groupId from the API response", async () => {
    vi.mocked(api.post).mockResolvedValue(createNoteResponse as never);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "g1" });
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.find((t) => t.id === "n1")?.groupId).toBe("g1");
  });

  it("does not touch the groups cache when the note is created ungrouped", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ...createNoteResponse.data, group_id: null },
    } as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: null });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups[0]?.tabs.map((t) => t.id)).toEqual(["t1"]);
  });

  it("still appends the note to the flat tabs cache on success", async () => {
    vi.mocked(api.post).mockResolvedValue(createNoteResponse as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "g1" });
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.map((t) => t.id)).toEqual(["t1", "n1"]);
  });

  it("assigns the next positionAt and an Untitled title to the optimistic temp note", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
    ]);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: "g1" });
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.[2]?.positionAt).toBe(3);
    expect(tabs?.[2]?.title).toBe("Untitled");
    expect(tabs?.[2]?.content).toBe("");
    // The temp id has a strict temp-<timestamp>-<6-char> shape; dropping the
    // .slice(2, 8) tail would change the suffix length.
    expect(tabs?.[2]?.id).toMatch(/^temp-\d+-[a-z0-9]{6}$/);

    await act(async () => {
      resolvePost(createNoteResponse);
      await pending;
    });
  });

  it("optimistically places a temp note in ungroupedTabs when created without a group", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: null });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs).toHaveLength(1);
    expect(cache?.ungroupedTabs[0]?.id).toMatch(/^temp-/);
    expect(cache?.ungroupedTabs[0]?.groupId).toBeNull();
    // The groups themselves are untouched.
    expect(
      cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id),
    ).toEqual(["t1"]);

    await act(async () => {
      resolvePost({ data: { ...createNoteResponse.data, group_id: null } });
      await pending;
    });
  });

  it("resets the tabs cache to just the new note when the cache was emptied mid-flight", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: null });
    });

    // The optimistic temp note is in the cache…
    expect(
      queryClient.getQueryData<Note[]>(queryKeys.notes.tabs)?.length,
    ).toBe(2);
    // …but a refetch/invalidation wipes the tabs cache before the POST resolves.
    queryClient.removeQueries({ queryKey: queryKeys.notes.tabs });

    await act(async () => {
      resolvePost({ data: { ...createNoteResponse.data, group_id: null } });
      await pending;
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.map((t) => t.id)).toEqual(["n1"]);
  });

  it("optimistically shows a temp tab before the server responds", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: "g1" });
    });

    // Before the server responds, a temp note is already in the flat tabs cache.
    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.length).toBe(2);
    expect(tabs?.[1]?.id).toMatch(/^temp-/);
    expect(tabs?.[1]?.groupId).toBe("g1");

    // And it appears inside the target group in the sidebar cache.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    const work = cache?.groups.find((g) => g.id === "g1");
    expect(work?.tabs.map((t) => t.id)).toEqual(["t1", expect.stringMatching(/^temp-/)]);

    // Resolve the request → temp is swapped for the real note.
    await act(async () => {
      resolvePost(createNoteResponse);
      await pending;
    });

    const tabsAfter = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabsAfter?.map((t) => t.id)).toEqual(["t1", "n1"]);
    const cacheAfter = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(
      cacheAfter?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id),
    ).toEqual(["t1", "n1"]);
  });

  it("rolls back the temp tab when create fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom") as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ groupId: "g1" }),
      ).rejects.toThrow("boom");
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.map((t) => t.id)).toEqual(["t1"]);
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id)).toEqual([
      "t1",
    ]);
  });

  it("cancels in-flight tabs and groups queries before the optimistic update", async () => {
    vi.mocked(api.post).mockResolvedValue(createNoteResponse as never);
    const queryClient = createTestQueryClient();
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "g1" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "tabs"] });
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
  });

  it("appends the server note when the temp note vanished from the tabs cache mid-flight", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: null });
    });

    // The temp note is wiped by a refetch, leaving a completely different list.
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "fake", title: "Fake", content: "", positionAt: 9, groupId: null },
    ]);

    await act(async () => {
      resolvePost({ data: { ...createNoteResponse.data, group_id: null } });
      await pending;
    });

    // The temp id no longer matches anything, so the real note must be appended.
    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.map((t) => t.id)).toEqual(["fake", "n1"]);
  });

  it("moves a temp ungrouped note into the group the server assigned on success", async () => {
    let resolvePost!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }) as never,
    );
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    let pending!: Promise<Note>;
    await act(async () => {
      pending = result.current.mutateAsync({ groupId: null });
    });

    // Optimistically the temp note sits in ungroupedTabs (no group was targeted).
    let cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual([
      expect.stringMatching(/^temp-/),
    ]);

    // The server assigns the note to g1 even though it was created ungrouped.
    await act(async () => {
      resolvePost(createNoteResponse);
      await pending;
    });

    cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs).toHaveLength(0);
    expect(
      cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id),
    ).toEqual(["t1", "n1"]);
    // The other group is untouched.
    expect(cache?.groups.find((g) => g.id === "g2")?.tabs).toHaveLength(0);
  });

  it("rolls back an ungrouped temp note and keeps other ungrouped tabs", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom") as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [
        { id: "t9", title: "Ungrouped", content: "", positionAt: 9, groupId: null },
      ],
    });

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ groupId: null }),
      ).rejects.toThrow("boom");
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t9"]);
    expect(
      cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id),
    ).toEqual(["t1"]);
  });

  it("does not crash when create fails and no groups cache exists", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom") as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);

    const { result } = renderHook(() => NoteMutations.create(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ groupId: "g1" }),
      ).rejects.toThrow("boom");
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.map((t) => t.id)).toEqual(["t1"]);
    expect(
      queryClient.getQueryData(queryKeys.tabGroups.withTabs),
    ).toBeUndefined();
  });
});

describe("delete note", () => {
  beforeEach(() => {
    vi.mocked(api.delete).mockReset();
  });

  const tabs = [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
    { id: "t3", title: "Three", content: "", positionAt: 3, groupId: null },
  ];

  it("calls DELETE /notes/:id with the deleted note's id", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1" });
    });

    expect(api.delete).toHaveBeenCalledWith("/notes/t1");
  });

  it("cancels in-flight tabs and groups queries before the optimistic delete", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "tabs"] });
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
  });

  it("removes the tab from the flat tabs cache immediately", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1" });
    });

    const cache = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(cache?.map((t) => t.id)).toEqual(["t2", "t3"]);
  });

  it("removes the tab from its group in the sidebar cache immediately", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    const work = cache?.groups.find((g) => g.id === "g1");
    expect(work?.tabs.map((t) => t.id)).toEqual(["t2"]);
    // Ungrouped tabs untouched.
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t3"]);
  });

  it("removes an ungrouped tab from the sidebar cache too", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t3" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual([]);
    expect(cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("restores tabs and groups cache when delete fails", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("boom") as never);
    // deleteNote() sets retry: 5 at the mutation level, which overrides the
    // client default (retry: false). Zero the retry delay so the 5 retries
    // complete instantly instead of backing off for 30s.
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retryDelay: 0 },
        queries: { retry: false, gcTime: Infinity },
      },
    });
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "t1" }),
      ).rejects.toThrow("boom");
    });

    const cache = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(cache?.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    const groups = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(groups?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
    expect(groups?.ungroupedTabs.map((t) => t.id)).toEqual(["t3"]);
    // deleteNote sets retry: 5 at the mutation level — one attempt plus five
    // retries. Dropping/weakening the retry config would change this count.
    expect(api.delete).toHaveBeenCalledTimes(6);
  });

  it("shows an error toast with the note id when delete fails", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retryDelay: 0 },
        queries: { retry: false, gcTime: Infinity },
      },
    });
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    seedWithTabs(queryClient, {
      groups: [{ ...groupWork, tabs: [tabs[0], tabs[1]] }],
      ungroupedTabs: [tabs[2]],
    });

    const { result } = renderHook(() => NoteMutations.deleteNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "t1" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to delete note t1");
    toastSpy.mockRestore();
  });
});

describe("update note (autosave)", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  const updateNote: Note = {
    id: "n1",
    title: "One",
    content: "new content",
    positionAt: 1,
    groupId: "g1",
  };

  it("calls PATCH /notes/:id with the new content", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => NoteMutations.update(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(updateNote);
    });

    expect(api.patch).toHaveBeenCalledWith("/notes/n1", {
      content: "new content",
    });
  });

  it("cancels the noteById query before the optimistic update", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note>(queryKeys.notes.noteById("n1"), updateNote);
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => NoteMutations.update(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(updateNote);
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "n1"] });
  });

  it("optimistically updates the noteById cache with the new content", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note>(queryKeys.notes.noteById("n1"), {
      ...updateNote,
      content: "old content",
    });

    const { result } = renderHook(() => NoteMutations.update(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(updateNote);
    });

    const cached = queryClient.getQueryData<Note>(
      queryKeys.notes.noteById("n1"),
    );
    expect(cached?.content).toBe("new content");
    expect(cached?.title).toBe("One");
  });
});

describe("renameTitle", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /notes/:id with the new title", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    const { result } = renderHook(() => NoteMutations.renameTitle(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "n1", title: "Renamed" });
    });

    expect(api.patch).toHaveBeenCalledWith("/notes/n1", {
      title: "Renamed",
    });
  });

  it("cancels the tabs and noteById queries before the optimistic rename", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => NoteMutations.renameTitle(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "n1", title: "Renamed" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "tabs"] });
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "n1"] });
  });

  it("optimistically updates both the tabs cache and the noteById cache", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
    ]);
    queryClient.setQueryData<Note>(queryKeys.notes.noteById("t1"), {
      id: "t1",
      title: "One",
      content: "",
      positionAt: 1,
      groupId: "g1",
    });

    const { result } = renderHook(() => NoteMutations.renameTitle(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1", title: "Renamed" });
    });

    const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(tabs?.find((t) => t.id === "t1")?.title).toBe("Renamed");
    // Other tabs are left untouched.
    expect(tabs?.find((t) => t.id === "t2")?.title).toBe("Two");

    const note = queryClient.getQueryData<Note>(
      queryKeys.notes.noteById("t1"),
    );
    expect(note?.title).toBe("Renamed");
  });

  it("shows an error toast when the rename fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    const { result } = renderHook(() => NoteMutations.renameTitle(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "n1", title: "New Title" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith(
      'Failed to rename note to "New Title"',
    );
    toastSpy.mockRestore();
  });

  it("does not create a noteById cache entry when none existed before", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    const { result } = renderHook(() => NoteMutations.renameTitle(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "n1", title: "Renamed" });
    });

    const note = queryClient.getQueryData<Note>(
      queryKeys.notes.noteById("n1"),
    );
    expect(note).toBeUndefined();
  });
});

describe("updateTabPosition", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /notes/tabs/:id with the new position", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => NoteMutations.updateTabPosition(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1", positionAt: 3 });
    });

    expect(api.patch).toHaveBeenCalledWith("/notes/tabs/t1", {
      position_at: 3,
    });
  });

  it("shows an error toast when reordering fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => NoteMutations.updateTabPosition(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "t1", positionAt: 3 }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to reorder tabs");
    toastSpy.mockRestore();
  });
});

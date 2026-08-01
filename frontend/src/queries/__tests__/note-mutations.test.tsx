import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { GroupMutations, queryKeys } from "@/queries";
import { createTestQueryClient } from "@/test/test-utils";
import type { Note, TabGroupWithTabs, TabsWithGroups } from "@/types";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Client-level (camelCase) shapes for the QueryCache.
const groupWork: TabGroupWithTabs = {
  id: "g1",
  name: "Work",
  positionAt: 1,
  collapsed: false,
  tabs: [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
  ],
};

const groupPersonal: TabGroupWithTabs = {
  id: "g2",
  name: "Personal",
  positionAt: 2,
  collapsed: false,
  tabs: [],
};

const ungroupedTab: Note = {
  id: "t9",
  title: "Ungrouped",
  content: "",
  positionAt: 9,
  groupId: null,
};

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

function seedFlatTabs(queryClient: QueryClient, tabs: Note[]) {
  queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
}

const createdGroupResponse = {
  data: { id: "g1", name: "Work", position_at: 1, collapsed: false, tabs: [] },
  message: "Tab group created",
};

describe("createGroup", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("calls POST /groups with the name", async () => {
    vi.mocked(api.post).mockResolvedValue(createdGroupResponse as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Work" });
    });

    expect(api.post).toHaveBeenCalledWith("/groups", { name: "Work" });
  });

  it("appends the new group to the cache on success", async () => {
    vi.mocked(api.post).mockResolvedValue(createdGroupResponse as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Work" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups).toHaveLength(1);
    expect(cache?.groups[0]?.name).toBe("Work");
  });
});

describe("renameGroup", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /groups/:id with the new name", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", name: "Personal" });
    });

    expect(api.patch).toHaveBeenCalledWith("/groups/g1", {
      name: "Personal",
    });
  });

  it("updates the cached group name optimistically", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", name: "Personal" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups[0]?.name).toBe("Personal");
  });
});

describe("deleteGroup", () => {
  beforeEach(() => {
    vi.mocked(api.delete).mockReset();
  });

  it("calls DELETE /groups/:id", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    expect(api.delete).toHaveBeenCalledWith("/groups/g1");
  });

  it("removes the group from cache and moves its tabs to ungrouped", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups).toHaveLength(0);
    expect(cache?.ungroupedTabs).toHaveLength(2);
    expect(cache?.ungroupedTabs[0]?.groupId).toBeNull();
  });

  it("leaves other groups fully intact when deleting one group", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    // The surviving group is still there — a filter that drops everything
    // would fail here.
    expect(cache?.groups.map((g) => g.id)).toEqual(["g2"]);
    expect(cache?.groups[0]).toEqual(groupPersonal);
    // The deleted group's tabs are now ungrouped and detached from g1.
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(cache?.ungroupedTabs.every((t) => t.groupId === null)).toBe(true);
  });

  it("sorts the merged ungrouped tabs by positionAt after deleting a group", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    // The existing ungrouped tab sits at positionAt 9 while the deleted
    // group's tabs have positionAt 1 and 5 — a naive append would put t9
    // first, so the merged list must be re-sorted by positionAt.
    const groupWithLowPositions: TabGroupWithTabs = {
      id: "g1",
      name: "Work",
      positionAt: 1,
      collapsed: false,
      tabs: [
        { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
        { id: "t2", title: "Two", content: "", positionAt: 5, groupId: "g1" },
      ],
    };
    seedWithTabs(queryClient, {
      groups: [groupWithLowPositions, groupPersonal],
      ungroupedTabs: [ungroupedTab],
    });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t1", "t2", "t9"]);
    expect(cache?.ungroupedTabs.map((t) => t.positionAt)).toEqual([1, 5, 9]);
  });

  it("captures the deleted group before cache removal so the flat tabs cache stays in sync", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
      { id: "t3", title: "Three", content: "", positionAt: 3, groupId: "g2" },
    ]);
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat?.find((t) => t.id === "t1")?.groupId).toBeNull();
    expect(flat?.find((t) => t.id === "t2")?.groupId).toBeNull();
    expect(flat?.find((t) => t.id === "t3")?.groupId).toBe("g2");
  });

  it("updates the flat tabs cache so deleted group tabs lose their group_id", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
    ]);
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat).toHaveLength(2);
    expect(flat?.every((t) => t.groupId === null)).toBe(true);
  });
});

describe("reorderGroups", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /groups/reorder and reorders the cached groups", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.reorderGroups(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupIds: ["g2", "g1"] });
    });

    expect(api.patch).toHaveBeenCalledWith("/groups/reorder", {
      group_ids: ["g2", "g1"],
    });
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
  });
});

describe("assignTabToGroup", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /tabs/:tabId/group with group_id", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: "g2" });
    });

    expect(api.patch).toHaveBeenCalledWith("/tabs/t1/group", {
      group_id: "g2",
    });
  });

  it("moves a tab between groups optimistically", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: "g2" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    const work = cache?.groups.find((g) => g.id === "g1");
    const personal = cache?.groups.find((g) => g.id === "g2");
    expect(work?.tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(personal?.tabs.map((t) => t.id)).toEqual(["t1"]);
    expect(personal?.tabs[0]?.groupId).toBe("g2");
  });

  it("moves an ungrouped tab into a group optimistically", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupPersonal],
      ungroupedTabs: [ungroupedTab],
    });
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t9", groupId: "g2" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.ungroupedTabs).toHaveLength(0);
    const personal = cache?.groups.find((g) => g.id === "g2");
    expect(personal?.tabs.map((t) => t.id)).toEqual(["t9"]);
    expect(personal?.tabs[0]?.groupId).toBe("g2");
  });

  it("unassigns a tab (groupId null) by moving it to ungrouped", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: null });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    const work = cache?.groups.find((g) => g.id === "g1");
    expect(work?.tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t1"]);
    expect(cache?.ungroupedTabs[0]?.groupId).toBeNull();
  });
});

describe("toggleCollapse", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockReset();
  });

  it("calls PATCH /groups/:id/collapse with the collapsed flag", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", collapsed: true });
    });

    expect(api.patch).toHaveBeenCalledWith("/groups/g1/collapse", {
      collapsed: true,
    });
  });

  it("toggles the collapsed flag in the cache", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", collapsed: true });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups[0]?.collapsed).toBe(true);
  });
});

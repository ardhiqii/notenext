import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useActiveGroup } from "@/hooks/use-active-group";
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

  it("keeps existing groups when appending a new one", async () => {
    vi.mocked(api.post).mockResolvedValue(createdGroupResponse as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupPersonal], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Work" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    // A handler that replaces the cache instead of appending would drop g2.
    expect(cache?.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
  });

  it("creates the groups cache from scratch when nothing is cached yet", async () => {
    vi.mocked(api.post).mockResolvedValue(createdGroupResponse as never);
    const queryClient = createTestQueryClient();
    // Note: no seedWithTabs — the withTabs cache is absent entirely.
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Work" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache).toEqual({
      groups: [expect.objectContaining({ id: "g1", name: "Work" })],
      ungroupedTabs: [],
    });
  });

  it("handles a bare group response without a .data wrapper", async () => {
    vi.mocked(api.post).mockResolvedValue({
      id: "g1",
      name: "Work",
      position_at: 1,
      collapsed: false,
      tabs: [],
    } as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Work" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups[0]?.name).toBe("Work");
  });

  it("shows an error toast when creating a group fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.createGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: "Work" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to create group");
    toastSpy.mockRestore();
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

  it("renames only the targeted group", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", name: "Renamed" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.name).toBe("Renamed");
    // The other group must keep its name.
    expect(cache?.groups.find((g) => g.id === "g2")?.name).toBe("Personal");
  });

  it("cancels the groups query before renaming", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", name: "Personal" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
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

  it("leaves the cache absent when renaming a group with nothing cached", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", name: "Personal" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache).toBeUndefined();
  });

  it("shows an error toast when renaming a group fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "g1", name: "Personal" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to rename group");
    toastSpy.mockRestore();
  });

  it("rolls back the optimistic rename when the API call fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.renameGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "g1", name: "Renamed" }),
      ).rejects.toThrow("boom");
    });

    // The optimistic rename must be undone: g1 keeps its old name.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.name).toBe("Work");
    expect(cache?.groups.find((g) => g.id === "g2")?.name).toBe("Personal");
    toastSpy.mockRestore();
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

  it("leaves the cache untouched when deleting a group that is not cached", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [ungroupedTab],
    });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "missing" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t9"]);
  });

  it("detaches only the deleted group's tabs from the flat cache (deleting the second group)", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    // g2 is the *second* group — a find that always matched the first group
    // would detach g1's tabs instead.
    const groupSecond: TabGroupWithTabs = {
      id: "g2",
      name: "Personal",
      positionAt: 2,
      collapsed: false,
      tabs: [
        { id: "t3", title: "Three", content: "", positionAt: 3, groupId: "g2" },
      ],
    };
    seedWithTabs(queryClient, {
      groups: [groupWork, groupSecond],
      ungroupedTabs: [],
    });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
      { ...groupSecond.tabs[0]! },
    ]);
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g2" });
    });

    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    // Only g2's tab loses its group.
    expect(flat?.find((t) => t.id === "t3")?.groupId).toBeNull();
    expect(flat?.find((t) => t.id === "t1")?.groupId).toBe("g1");
    expect(flat?.find((t) => t.id === "t2")?.groupId).toBe("g1");
  });

  it("does not crash when deleting a group while the groups cache is absent", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toBeUndefined();
  });

  it("keeps flat tabs untouched when deleting a group that is not in the cache", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork],
      ungroupedTabs: [ungroupedTab],
    });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
      { ...ungroupedTab },
    ]);
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "missing" });
    });

    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat?.map((t) => t.id)).toEqual(["t1", "t2", "t9"]);
    expect(flat?.find((t) => t.id === "t1")?.groupId).toBe("g1");
  });

  it("cancels the groups query before deleting", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
  });

  it("shows an error toast when deleting a group fails", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "g1" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to delete group");
    toastSpy.mockRestore();
  });

  it("rolls back both caches when deleting a group fails", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
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
      await expect(
        result.current.mutateAsync({ id: "g1" }),
      ).rejects.toThrow("boom");
    });

    // Groups cache restored: the group is back and tabs stay grouped.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(cache?.ungroupedTabs).toHaveLength(0);
    // Flat tabs cache restored: tabs keep their group_id.
    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat?.every((t) => t.groupId === "g1")).toBe(true);
    toastSpy.mockRestore();
  });

  it("clears the active group when the deleted group was active", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    useActiveGroup.setState({ activeGroupId: "g1" });
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1" });
    });

    expect(useActiveGroup.getState().activeGroupId).toBeNull();
    useActiveGroup.setState({ activeGroupId: null });
  });

  it("keeps the active group when deleting a different group", async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined as never);
    useActiveGroup.setState({ activeGroupId: "g1" });
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.deleteGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g2" });
    });

    expect(useActiveGroup.getState().activeGroupId).toBe("g1");
    useActiveGroup.setState({ activeGroupId: null });
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

  it("cancels the groups query before reordering", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);
    const { result } = renderHook(() => GroupMutations.reorderGroups(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupIds: ["g2", "g1"] });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
  });

  it("does not crash when reordering while the groups cache is absent", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.reorderGroups(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupIds: ["g1"] });
    });

    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toBeUndefined();
  });

  it("drops group ids that are not in the cache when reordering", async () => {
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
      await result.current.mutateAsync({ groupIds: ["g2", "ghost", "g1"] });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
    // No undefined holes may be left behind.
    expect(cache?.groups.every((g) => g !== undefined)).toBe(true);
  });

  it("shows an error toast when reordering groups fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.reorderGroups(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ groupIds: ["g2", "g1"] }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to reorder groups");
    toastSpy.mockRestore();
  });

  it("rolls back the optimistic reorder when the API call fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.reorderGroups(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ groupIds: ["g2", "g1"] }),
      ).rejects.toThrow("boom");
    });

    // The optimistic reorder must be undone: original order is restored.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    toastSpy.mockRestore();
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

  it("cancels the groups and tabs queries before moving", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: "g2" });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["notes", "tabs"] });
  });

  it("does not crash when moving a tab while the groups cache is absent", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: "g2" });
    });

    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toBeUndefined();
  });

  it("does not steal an ungrouped tab when moving a grouped tab", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    // t1 lives in g1; t9 is an unrelated ungrouped tab. A findIndex that
    // always matched the first ungrouped tab would move t9 instead of t1.
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [ungroupedTab],
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
    expect(cache?.groups.find((g) => g.id === "g2")?.tabs.map((t) => t.id)).toEqual([
      "t1",
    ]);
    // The unrelated ungrouped tab stays put.
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t9"]);
  });

  it("keeps other ungrouped tabs when moving one ungrouped tab into a group", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupPersonal],
      ungroupedTabs: [
        ungroupedTab,
        { id: "t8", title: "Eight", content: "", positionAt: 8, groupId: null },
      ],
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
    expect(cache?.groups.find((g) => g.id === "g2")?.tabs.map((t) => t.id)).toEqual([
      "t9",
    ]);
    // t8 must survive the ungrouped filter.
    expect(cache?.ungroupedTabs.map((t) => t.id)).toEqual(["t8"]);
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

  it("keeps the flat tabs cache in sync with the new group membership", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
    ]);
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "t1", groupId: "g2" });
    });

    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat?.find((t) => t.id === "t1")?.groupId).toBe("g2");
    // The other tab keeps its group.
    expect(flat?.find((t) => t.id === "t2")?.groupId).toBe("g1");
  });

  it("leaves the cache untouched when the tab is not found anywhere", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    seedFlatTabs(queryClient, [{ ...groupWork.tabs[0]! }]);
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ tabId: "nope", groupId: "g2" });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
    expect(cache?.groups.find((g) => g.id === "g2")?.tabs).toHaveLength(0);
  });

  it("shows an error toast when moving a tab fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ tabId: "t1", groupId: "g2" }),
      ).rejects.toThrow("boom");
    });

    expect(toastSpy).toHaveBeenCalledWith("Failed to move tab");
    toastSpy.mockRestore();
  });

  it("rolls back both caches when moving a tab fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    seedFlatTabs(queryClient, [
      { ...groupWork.tabs[0]! },
      { ...groupWork.tabs[1]! },
    ]);
    const { result } = renderHook(() => GroupMutations.assignTabToGroup(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ tabId: "t1", groupId: "g2" }),
      ).rejects.toThrow("boom");
    });

    // Groups cache: t1 is back in g1 and g2 has no tabs.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.tabs.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
    expect(cache?.groups.find((g) => g.id === "g2")?.tabs).toHaveLength(0);
    // Flat tabs cache: t1 keeps its original group_id.
    const flat = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    expect(flat?.find((t) => t.id === "t1")?.groupId).toBe("g1");
    toastSpy.mockRestore();
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

  it("collapses only the targeted group", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, {
      groups: [groupWork, groupPersonal],
      ungroupedTabs: [],
    });
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", collapsed: true });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups.find((g) => g.id === "g1")?.collapsed).toBe(true);
    // The other group must stay expanded.
    expect(cache?.groups.find((g) => g.id === "g2")?.collapsed).toBe(false);
  });

  it("cancels the groups query before toggling collapse", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined as never);
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", collapsed: true });
    });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["tab-groups", "tabs"] });
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

  it("leaves the cache absent when toggling collapse with nothing cached", async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", collapsed: true });
    });

    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache).toBeUndefined();
  });

  it("rolls back the optimistic collapse when the API call fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("boom") as never);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const queryClient = createTestQueryClient();
    seedWithTabs(queryClient, { groups: [groupWork], ungroupedTabs: [] });
    const { result } = renderHook(() => GroupMutations.toggleCollapse(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "g1", collapsed: true }),
      ).rejects.toThrow("boom");
    });

    // The optimistic collapse must be undone: the group stays expanded.
    const cache = queryClient.getQueryData<TabsWithGroups>(
      queryKeys.tabGroups.withTabs,
    );
    expect(cache?.groups[0]?.collapsed).toBe(false);
    toastSpy.mockRestore();
  });
});

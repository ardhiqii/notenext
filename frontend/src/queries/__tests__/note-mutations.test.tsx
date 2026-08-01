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
});

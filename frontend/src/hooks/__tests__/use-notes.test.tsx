import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/queries";
import { createTestQueryClient } from "@/test/test-utils";
import type { Note } from "@/types";
import { useNotes } from "../use-notes";
import { useActiveGroup } from "../use-active-group";

// Hoisted holders so vi.mock factories can capture the fake mutation's mutate.
const mutationMocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useMatchRoute: () => () => undefined,
}));

vi.mock("@/queries/note-mutations", () => ({
  NoteMutations: {
    create: () => ({
      mutate: mutationMocks.createMutate,
      isPending: false,
    }),
    deleteNote: () => ({ mutate: vi.fn() }),
    renameTitle: () => ({ mutate: vi.fn() }),
    update: () => ({ mutate: vi.fn() }),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useNotes createNewNote", () => {
  beforeEach(() => {
    useActiveGroup.setState({ activeGroupId: null });
    mutationMocks.createMutate.mockReset();
  });

  it("passes the active group id to the create mutation", async () => {
    useActiveGroup.setState({ activeGroupId: "g1" });
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(mutationMocks.createMutate).toHaveBeenCalledWith(
      { groupId: "g1" },
      expect.any(Object),
    );
  });

  it("passes a null group id when no group is active", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(mutationMocks.createMutate).toHaveBeenCalledWith(
      { groupId: null },
      expect.any(Object),
    );
  });
});

describe("useNotes changeCurrentNote", () => {
  beforeEach(() => {
    useActiveGroup.setState({ activeGroupId: null });
  });

  it("sets the active group from the opened tab's groupId in the tabs cache", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: null },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.changeCurrentNote("t1");
    });

    expect(useActiveGroup.getState().activeGroupId).toBe("g1");
  });

  it("clears the active group when the opened tab is ungrouped", () => {
    useActiveGroup.setState({ activeGroupId: "g1" });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: null },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.changeCurrentNote("t2");
    });

    expect(useActiveGroup.getState().activeGroupId).toBeNull();
  });

  it("leaves the active group unchanged when the tab is not in the cache", () => {
    useActiveGroup.setState({ activeGroupId: "g1" });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.changeCurrentNote("missing");
    });

    expect(useActiveGroup.getState().activeGroupId).toBe("g1");
  });
});

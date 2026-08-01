import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { queryKeys } from "@/queries";
import { createTestQueryClient } from "@/test/test-utils";
import type { Note } from "@/types";
import { useNotes } from "../use-notes";
import { useActiveGroup } from "../use-active-group";
import { useAuth } from "../use-auth";

// Hoisted holders so vi.mock factories can capture the fake mutation's mutate
// and the api.post call that the real mutation would make.
const mutationMocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: mutationMocks.apiPost,
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useMatchRoute: () => () => undefined,
}));

vi.mock("@/queries/note-mutations", () => ({
  NoteMutations: {
    create: () => ({
      mutate: (params: unknown, options?: unknown) => {
        // Stand-in for the real mutation: the create mutation would POST /notes.
        mutationMocks.apiPost(params);
        return mutationMocks.createMutate(params, options);
      },
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
    useAuth.setState({ user: null });
    mutationMocks.createMutate.mockReset();
    mutationMocks.apiPost.mockReset();
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

  it("blocks guests who already have 3 notes: shows a toast and does not call the API", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: null },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: null },
      { id: "t3", title: "Three", content: "", positionAt: 3, groupId: null },
    ]);
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(toastSpy).toHaveBeenCalledWith(
      "Guest users can only have 3 notes. Log in to create more.",
    );
    expect(mutationMocks.apiPost).not.toHaveBeenCalled();
    expect(mutationMocks.createMutate).not.toHaveBeenCalled();
    toastSpy.mockRestore();
  });

  it("lets guests below the 3-note limit create a note (API is called)", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: null },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: null },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(mutationMocks.apiPost).toHaveBeenCalledWith({ groupId: null });
    expect(mutationMocks.createMutate).toHaveBeenCalledWith(
      { groupId: null },
      expect.any(Object),
    );
  });

  it("shows the guest-limit toast when the create request fails with 403", async () => {
    const queryClient = createTestQueryClient();
    let capturedOptions: { onError?: (error: unknown) => void } | undefined;
    mutationMocks.createMutate.mockImplementation(
      (_params: unknown, options?: unknown) => {
        capturedOptions = options as { onError?: (error: unknown) => void };
      },
    );
    const toastSpy = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "" as never);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    act(() => {
      capturedOptions?.onError?.({
        isAxiosError: true,
        response: { status: 403 },
      });
    });

    expect(toastSpy).toHaveBeenCalledWith(
      "Guest users can only have 3 notes. Log in to create more.",
    );
    toastSpy.mockRestore();
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

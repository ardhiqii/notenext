import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { queryKeys } from "@/queries";
import { createTestQueryClient } from "@/test/test-utils";
import type { Note } from "@/types";
import { useNotes, __resetCreateInFlightForTests } from "../use-notes";
import { useActiveGroup } from "../use-active-group";
import { useAuth } from "../use-auth";
import { useModal } from "../use-modal";

// Hoisted holders so vi.mock factories can capture the fake mutation's mutate
// and the api.post call that the real mutation would make.
const mutationMocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  apiPost: vi.fn(),
  createIsPending: false,
  deleteMutate: vi.fn(),
  renameMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  matchRouteResult: undefined as unknown,
  matchRouteArg: undefined as unknown,
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
  useNavigate: () => routerMocks.navigate,
  useMatchRoute: () => (arg: unknown) => {
    routerMocks.matchRouteArg = arg;
    return routerMocks.matchRouteResult;
  },
}));

vi.mock("@/queries/note-mutations", () => ({
  NoteMutations: {
    create: () => ({
      mutate: (params: unknown, options?: unknown) => {
        // Stand-in for the real mutation: the create mutation would POST /notes.
        mutationMocks.apiPost(params);
        return mutationMocks.createMutate(params, options);
      },
      isPending: mutationMocks.createIsPending,
    }),
    deleteNote: () => ({ mutate: mutationMocks.deleteMutate }),
    renameTitle: () => ({ mutate: mutationMocks.renameMutate }),
    update: () => ({ mutate: mutationMocks.updateMutate }),
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
    __resetCreateInFlightForTests();
    useActiveGroup.setState({ activeGroupId: null });
    useAuth.setState({ user: null });
    mutationMocks.createMutate.mockReset();
    mutationMocks.apiPost.mockReset();
    mutationMocks.createIsPending = false;
    mutationMocks.deleteMutate.mockReset();
    mutationMocks.renameMutate.mockReset();
    mutationMocks.updateMutate.mockReset();
    routerMocks.navigate.mockReset();
    routerMocks.matchRouteResult = undefined;
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

  it("lets logged-in users create notes even with 3+ tabs (the limit is guest-only)", async () => {
    useAuth.setState({
      user: {
        id: "u1",
        username: "alice",
        email: "alice@example.com",
        name: "Alice",
        avatarURL: null,
        has_password: true,
      },
    });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: null },
      { id: "t2", title: "Two", content: "", positionAt: 2, groupId: null },
      { id: "t3", title: "Three", content: "", positionAt: 3, groupId: null },
      { id: "t4", title: "Four", content: "", positionAt: 4, groupId: null },
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

  it("does not create another note while a create is already pending", async () => {
    mutationMocks.createIsPending = true;
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(mutationMocks.apiPost).not.toHaveBeenCalled();
    expect(mutationMocks.createMutate).not.toHaveBeenCalled();
  });

  it("closes the modal and navigates to the new note on success", async () => {
    const queryClient = createTestQueryClient();
    let capturedOptions: { onSuccess?: (note: Note) => void } | undefined;
    mutationMocks.createMutate.mockImplementation(
      (_params: unknown, options?: unknown) => {
        capturedOptions = options as { onSuccess?: (note: Note) => void };
      },
    );
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    act(() => {
      capturedOptions?.onSuccess?.({
        id: "n1",
        title: "Untitled",
        content: "",
        positionAt: 1,
        groupId: null,
      });
    });

    expect(useModal.getState().isOpen).toBe(false);
    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "n1" },
    });
  });

  it("opens the connection-note modal before creating", async () => {
    const queryClient = createTestQueryClient();
    const openSpy = vi
      .spyOn(useModal.getState(), "openModal")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createNewNote();
    });

    expect(openSpy).toHaveBeenCalledWith("connection-note");
    openSpy.mockRestore();
  });

  it("does not show the guest toast for a non-403 create error", async () => {
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
        response: { status: 500 },
      });
    });

    expect(toastSpy).not.toHaveBeenCalled();
    toastSpy.mockRestore();
  });

  it("does not show the guest toast for a non-axios error even with a 403 response", async () => {
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
      capturedOptions?.onError?.({ response: { status: 403 } });
    });

    expect(toastSpy).not.toHaveBeenCalled();
    toastSpy.mockRestore();
  });

  it("does not crash when the create error has no response object", async () => {
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

    expect(() => {
      act(() => {
        capturedOptions?.onError?.({ isAxiosError: true });
      });
    }).not.toThrow();
    expect(toastSpy).not.toHaveBeenCalled();
    toastSpy.mockRestore();
  });
});

describe("useNotes matchRoute", () => {
  beforeEach(() => {
    routerMocks.matchRouteArg = undefined;
    routerMocks.matchRouteResult = undefined;
  });

  it("matches the note route with /n/$noteId so the current note id resolves", () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    expect(routerMocks.matchRouteArg).toEqual({ to: "/n/$noteId" });
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

describe("useNotes closeNote", () => {
  beforeEach(() => {
    useActiveGroup.setState({ activeGroupId: null });
    mutationMocks.deleteMutate.mockReset();
    routerMocks.navigate.mockReset();
    routerMocks.matchRouteResult = undefined;
  });

  const tabs = [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
    { id: "t3", title: "Three", content: "", positionAt: 3, groupId: null },
  ];

  it("navigates to the empty workspace when closing the last remaining tab", () => {
    routerMocks.matchRouteResult = { noteId: "t1" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: null },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.closeNote("t1");
    });

    // Closing the last tab still deletes it — no silent no-op.
    expect(mutationMocks.deleteMutate).toHaveBeenCalledWith(
      { id: "t1", onMutateFn: expect.any(Function) },
    );
    const params = mutationMocks.deleteMutate.mock.calls[0]?.[0] as {
      onMutateFn: () => void;
    };
    // Simulate the real mutation's onMutate: the only tab is removed,
    // leaving an empty tabs cache.
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, []);
    act(() => {
      params.onMutateFn();
    });
    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("does not delete when the tabs cache is empty", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.closeNote("t1");
    });

    expect(mutationMocks.deleteMutate).not.toHaveBeenCalled();
  });

  it("navigates to the next tab when closing a non-last tab", () => {
    routerMocks.matchRouteResult = { noteId: "t2" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.closeNote("t2");
    });

    expect(mutationMocks.deleteMutate).toHaveBeenCalledWith(
      { id: "t2", onMutateFn: expect.any(Function) },
    );
    const params = mutationMocks.deleteMutate.mock.calls[0]?.[0] as {
      onMutateFn: () => void;
    };
    // Simulate what the real mutation's onMutate does before onMutateFn runs:
    // the closed tab is already removed from the cache.
    queryClient.setQueryData<Note[]>(
      queryKeys.notes.tabs,
      tabs.filter((t) => t.id !== "t2"),
    );
    act(() => {
      params.onMutateFn();
    });
    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "t3" },
    });
  });

  it("navigates to the previous tab when closing the last tab", () => {
    routerMocks.matchRouteResult = { noteId: "t3" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.closeNote("t3");
    });

    const params = mutationMocks.deleteMutate.mock.calls[0]?.[0] as {
      onMutateFn: () => void;
    };
    // Simulate the mutation's onMutate: t3 removed from cache before onMutateFn.
    queryClient.setQueryData<Note[]>(
      queryKeys.notes.tabs,
      tabs.filter((t) => t.id !== "t3"),
    );
    act(() => {
      params.onMutateFn();
    });
    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "t2" },
    });
  });

  it("does not navigate when closing a tab that is not the current one", () => {
    routerMocks.matchRouteResult = { noteId: "t1" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.closeNote("t2");
    });

    const params = mutationMocks.deleteMutate.mock.calls[0]?.[0] as {
      onMutateFn: () => void;
    };
    act(() => {
      params.onMutateFn();
    });
    expect(routerMocks.navigate).not.toHaveBeenCalled();
  });
});

describe("useNotes content/rename forwarding", () => {
  beforeEach(() => {
    mutationMocks.updateMutate.mockReset();
    mutationMocks.renameMutate.mockReset();
  });

  it("forwards the note to the update (autosave) mutation", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });
    const note: Note = {
      id: "t1",
      title: "One",
      content: "new content",
      positionAt: 1,
      groupId: null,
    };

    act(() => {
      result.current.updateContentNote(note);
    });

    expect(mutationMocks.updateMutate).toHaveBeenCalledWith(note);
  });

  it("forwards id and title to the rename mutation", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.renameTitleNote("t1", "Renamed");
    });

    expect(mutationMocks.renameMutate).toHaveBeenCalledWith({
      id: "t1",
      title: "Renamed",
    });
  });
});

describe("useNotes dropStaleNote", () => {
  beforeEach(() => {
    useActiveGroup.setState({ activeGroupId: null });
    mutationMocks.deleteMutate.mockReset();
    routerMocks.navigate.mockReset();
    routerMocks.matchRouteResult = undefined;
  });

  const tabs = [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
    { id: "t3", title: "Three", content: "", positionAt: 3, groupId: null },
  ];

  it("removes the stale tab from the tabs cache without calling the API", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t2");
    });

    expect(queryClient.getQueryData<Note[]>(queryKeys.notes.tabs)).toEqual([
      tabs[0],
      tabs[2],
    ]);
    // Local-only: neither the DELETE API nor the delete mutation may run —
    // the note is already gone server-side and a DELETE would 404 + rollback.
    expect(mutationMocks.deleteMutate).not.toHaveBeenCalled();
  });

  it("removes the stale tab from the groups cache and the noteById cache", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    queryClient.setQueryData(queryKeys.tabGroups.withTabs, {
      groups: [
        {
          id: "g1",
          name: "General",
          positionAt: 1,
          collapsed: false,
          tabs: [tabs[0], tabs[1]],
        },
      ],
      ungroupedTabs: [tabs[2]],
    });
    queryClient.setQueryData(queryKeys.notes.noteById("t2"), tabs[1]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t2");
    });

    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toEqual({
      groups: [
        {
          id: "g1",
          name: "General",
          positionAt: 1,
          collapsed: false,
          tabs: [tabs[0]],
        },
      ],
      ungroupedTabs: [tabs[2]],
    });
    expect(
      queryClient.getQueryData(queryKeys.notes.noteById("t2")),
    ).toBeUndefined();
  });

  it("navigates to the empty workspace when dropping the last remaining tab", () => {
    routerMocks.matchRouteResult = { noteId: "t1" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, [
      { id: "t1", title: "One", content: "", positionAt: 1, groupId: null },
    ]);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t1");
    });

    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: "/" });
    expect(mutationMocks.deleteMutate).not.toHaveBeenCalled();
  });

  it("navigates to the tab at the same position when dropping a non-last stale tab", () => {
    routerMocks.matchRouteResult = { noteId: "t2" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t2");
    });

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "t3" },
    });
  });

  it("navigates to the previous tab when dropping the last stale tab", () => {
    routerMocks.matchRouteResult = { noteId: "t3" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t3");
    });

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "t2" },
    });
  });

  it("does not navigate when dropping a tab that is not the current one", () => {
    routerMocks.matchRouteResult = { noteId: "t1" };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<Note[]>(queryKeys.notes.tabs, tabs);
    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.dropStaleNote("t2");
    });

    expect(routerMocks.navigate).not.toHaveBeenCalled();
  });
});

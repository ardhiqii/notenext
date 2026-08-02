import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@/components/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useActiveGroup } from "@/hooks/use-active-group";
import { api } from "@/lib/api";
import { renderWithProviders } from "@/test/test-utils";
import type { User } from "@/types";

// Hoisted holders so vi.mock factories can capture/configure values.
const dndMocks = vi.hoisted(() => ({
  onDragEnd: null as ((event: unknown) => void) | null,
}));

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMocks.navigate,
  useMatchRoute: () => () => undefined,
}));

vi.mock("@dnd-kit/core", () => ({
  closestCenter: () => "closestCenter",
  PointerSensor: class PointerSensor {},
  useSensor: () => ({}),
  useSensors: () => ({}),
  DndContext: ({
    onDragEnd,
    children,
  }: {
    onDragEnd?: (event: unknown) => void;
    children?: ReactNode;
  }) => {
    dndMocks.onDragEnd = onDragEnd ?? null;
    return <div data-testid="dnd-context">{children}</div>;
  },
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    transform: null,
    transition: undefined,
    setNodeRef: () => {},
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockUser: User = {
  id: "u1",
  username: "tester",
  email: "tester@example.com",
  name: "Tester",
  avatarURL: null,
  has_password: false,
};

// Server-level (snake_case) shapes — the GET /groups response body.
const groupWork = {
  id: "g1",
  name: "Work",
  position_at: 1,
  collapsed: false,
  tabs: [
    { id: "t1", title: "One", content: "", position_at: 1, group_id: "g1" },
    { id: "t2", title: "Two", content: "", position_at: 2, group_id: "g1" },
  ],
};

const groupPersonal = {
  id: "g2",
  name: "Personal",
  position_at: 2,
  collapsed: false,
  tabs: [],
};

function mockGroupsResponse(groups: unknown[], ungroupedTabs: unknown[] = []) {
  vi.mocked(api.get).mockResolvedValue({
    data: { groups, ungrouped_tabs: ungroupedTabs },
  } as never);
}

function mockCreateResponse() {
  vi.mocked(api.post).mockResolvedValue({
    data: { id: "g1", name: "Work", position_at: 1, collapsed: false, tabs: [] },
    message: "Tab group created",
  } as never);
}

// Server-level shape for POST /notes (new note creation)
function mockNoteCreateResponse(note: Record<string, unknown> = {}) {
  vi.mocked(api.post).mockImplementation((((url: string) => {
    if (url === "/notes") {
      return Promise.resolve({
        data: {
          id: "new1",
          title: "Untitled",
          content: "",
          position_at: 1,
          group_id: null,
          ...note,
        },
      });
    }
    return Promise.resolve({
      data: { id: "g1", name: "Work", position_at: 1, collapsed: false, tabs: [] },
    });
  }) as never));
}

const ungroupedTab1 = {
  id: "t1",
  title: "One",
  content: "",
  position_at: 1,
  group_id: null,
};

const ungroupedTab2 = {
  id: "t2",
  title: "Two",
  content: "",
  position_at: 2,
  group_id: null,
};

// Server-level shape for GET /notes/public (global seeded notes)
const publicNote1 = {
  id: "pub1",
  title: "Welcome",
  content: "",
  position_at: 1,
  group_id: null,
};

const publicNote2 = {
  id: "pub2",
  title: "Getting Started",
  content: "",
  position_at: 2,
  group_id: null,
};

function mockPublicNotesResponse(notes: unknown[]) {
  // Match by URL so the mock lands on the right request regardless of
  // React Query's fetch order (groups vs public notes).
  vi.mocked(api.get).mockImplementation(((url: string) => {
    if (url === "/notes/public") {
      return Promise.resolve({ data: notes });
    }
    return Promise.resolve({ data: { groups: [], ungrouped_tabs: [] } });
  }) as never);
}

describe("Sidebar", () => {
  beforeEach(() => {
    useAuth.setState({
      user: mockUser,
      accessToken: "token",
      refreshFailed: false,
    });
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.delete).mockReset();
  });

  afterEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
  });

  it("renders the list of groups from the API", async () => {
    mockGroupsResponse([groupWork, groupPersonal]);

    renderWithProviders(<Sidebar />);

    expect(await screen.findByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // tab count badge
  });

  it("renders the empty state when there are no groups", async () => {
    mockGroupsResponse([]);

    renderWithProviders(<Sidebar />);

    expect(
      await screen.findByText(
        "No groups yet. Create one to organize your tabs.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the inline create-group input when + → New Group is clicked", async () => {
    mockGroupsResponse([]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("No groups yet. Create one to organize your tabs.");

    await userEvent.click(screen.getByTitle("New note or group"));
    await userEvent.click(await screen.findByText("New Group"));

    expect(screen.getByPlaceholderText("Group name")).toBeInTheDocument();
  });

  it("creates a group when Enter is pressed", async () => {
    mockGroupsResponse([]);
    mockCreateResponse();

    renderWithProviders(<Sidebar />);
    await screen.findByText("No groups yet. Create one to organize your tabs.");

    await userEvent.click(screen.getByTitle("New note or group"));
    await userEvent.click(await screen.findByText("New Group"));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "Work");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/groups", { name: "Work" }),
    );
  });

  it("creates a group when the input is blurred", async () => {
    mockGroupsResponse([]);
    mockCreateResponse();

    renderWithProviders(<Sidebar />);
    await screen.findByText("No groups yet. Create one to organize your tabs.");

    await userEvent.click(screen.getByTitle("New note or group"));
    await userEvent.click(await screen.findByText("New Group"));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "Work");
    fireEvent.blur(screen.getByPlaceholderText("Group name"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/groups", { name: "Work" }),
    );
  });

  it("cancels group creation on Escape without calling the API", async () => {
    mockGroupsResponse([]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("No groups yet. Create one to organize your tabs.");

    await userEvent.click(screen.getByTitle("New note or group"));
    await userEvent.click(await screen.findByText("New Group"));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "Work");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Group name")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a new note from the + dropdown New Note option", async () => {
    useActiveGroup.setState({ activeGroupId: null });
    mockGroupsResponse([groupPersonal]);
    mockNoteCreateResponse();

    renderWithProviders(<Sidebar />);
    await screen.findByText("Personal");

    await userEvent.click(screen.getByTitle("New note or group"));
    await userEvent.click(await screen.findByText("New Note"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/notes", {}),
    );
  });

  it("creates a new note inside the group when an empty group is clicked", async () => {
    useActiveGroup.setState({ activeGroupId: null });
    mockGroupsResponse([groupPersonal]);
    mockNoteCreateResponse();

    renderWithProviders(<Sidebar />);
    await screen.findByText("Personal");

    await userEvent.click(screen.getByText("Personal"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/notes", { group_id: "g2" }),
    );
  });

  it("creates a new note inside the group from the hover + button", async () => {
    useActiveGroup.setState({ activeGroupId: null });
    mockGroupsResponse([groupPersonal]);
    mockNoteCreateResponse();

    renderWithProviders(<Sidebar />);
    await screen.findByText("Personal");

    await userEvent.click(screen.getByTitle("New note in group"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/notes", { group_id: "g2" }),
    );
  });

  it("shows the secondary New group button when the list is empty", async () => {
    mockGroupsResponse([]);

    renderWithProviders(<Sidebar />);

    expect(
      await screen.findByText("No groups yet. Create one to organize your tabs."),
    ).toBeInTheDocument();
    expect(screen.getByText("New group")).toBeInTheDocument();
  });

  it("opens the context menu on right-click with Rename and Delete", async () => {
    mockGroupsResponse([groupWork]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    fireEvent.contextMenu(screen.getByText("Work"));

    expect(await screen.findByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows a pre-filled inline input when Rename is clicked", async () => {
    mockGroupsResponse([groupWork]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    fireEvent.contextMenu(screen.getByText("Work"));
    await userEvent.click(await screen.findByText("Rename"));

    expect(await screen.findByDisplayValue("Work")).toBeInTheDocument();
  });

  it("renames the group through the context menu", async () => {
    mockGroupsResponse([groupWork]);
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    fireEvent.contextMenu(screen.getByText("Work"));
    await userEvent.click(await screen.findByText("Rename"));

    const input = await screen.findByDisplayValue("Work");
    await userEvent.clear(input);
    await userEvent.type(input, "Personal");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/groups/g1", {
        name: "Personal",
      }),
    );
  });

  it("deletes the group when Delete is clicked in the context menu", async () => {
    mockGroupsResponse([groupWork]);
    vi.mocked(api.delete).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    fireEvent.contextMenu(screen.getByText("Work"));
    await userEvent.click(await screen.findByText("Delete"));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/groups/g1"));
  });

  it("reorders groups on drag end", async () => {
    mockGroupsResponse([groupWork, groupPersonal]);
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    act(() => {
      dndMocks.onDragEnd?.({ active: { id: "g1" }, over: { id: "g2" } });
    });

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/groups/reorder", {
        group_ids: ["g2", "g1"],
      }),
    );
  });

  it("sets the active group when a group is clicked", async () => {
    useActiveGroup.setState({ activeGroupId: null });
    mockGroupsResponse([groupWork, groupPersonal]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    await userEvent.click(screen.getByText("Work"));

    expect(useActiveGroup.getState().activeGroupId).toBe("g1");
  });

  it("sets the active group even when the group has no tabs", async () => {
    useActiveGroup.setState({ activeGroupId: null });
    mockGroupsResponse([groupPersonal]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Personal");

    await userEvent.click(screen.getByText("Personal"));

    expect(useActiveGroup.getState().activeGroupId).toBe("g2");
  });

  it("auto-creates a General group when tabs exist but no groups", async () => {
    mockGroupsResponse([], [ungroupedTab1, ungroupedTab2]);
    mockCreateResponse();
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/groups", { name: "General" }),
    );
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
    expect(api.patch).toHaveBeenCalledWith("/tabs/t1/group", {
      group_id: "g1",
    });
    expect(api.patch).toHaveBeenCalledWith("/tabs/t2/group", {
      group_id: "g1",
    });
  });

  it("does NOT auto-create a group when groups already exist", async () => {
    mockGroupsResponse([groupWork]);
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    expect(api.post).not.toHaveBeenCalled();
  });

  it("does NOT auto-create a group when there are no tabs", async () => {
    mockGroupsResponse([]);
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await screen.findByText("No groups yet. Create one to organize your tabs.");

    expect(api.post).not.toHaveBeenCalled();
  });

  it("auto-creates the default group only once", async () => {
    mockGroupsResponse([], [ungroupedTab1]);
    mockCreateResponse();
    vi.mocked(api.patch).mockResolvedValue(undefined as never);

    renderWithProviders(<Sidebar />);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    // Refetch (simulating post-create query invalidation) must not re-trigger
    mockGroupsResponse([
      {
        id: "g1",
        name: "General",
        position_at: 1,
        collapsed: false,
        tabs: [ungroupedTab1],
      },
    ]);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("renders the Public group with count and lock when public notes exist", async () => {
    mockGroupsResponse([groupWork]);
    mockPublicNotesResponse([publicNote1, publicNote2]);

    renderWithProviders(<Sidebar />);

    expect(await screen.findByText("Public")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // public count badge
    expect(screen.getByTitle("Public notes — read only")).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });

  it("collapses and expands public notes via the chevron", async () => {
    mockGroupsResponse([groupWork]);
    mockPublicNotesResponse([publicNote1, publicNote2]);

    renderWithProviders(<Sidebar />);
    expect(await screen.findByText("Welcome")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Collapse public group"));
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Expand public group"));
    expect(await screen.findByText("Welcome")).toBeInTheDocument();
  });

  it("opens the first public note when the Public row is clicked", async () => {
    mockGroupsResponse([groupWork]);
    mockPublicNotesResponse([publicNote1, publicNote2]);
    routerMocks.navigate.mockClear();

    renderWithProviders(<Sidebar />);
    await screen.findByText("Public");

    await userEvent.click(screen.getByText("Public"));

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/n/$noteId",
      params: { noteId: "pub1" },
    });
  });

  it("shows read-only notice when Public group is right-clicked", async () => {
    mockGroupsResponse([groupWork]);
    mockPublicNotesResponse([publicNote1, publicNote2]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Public");

    fireEvent.contextMenu(screen.getByText("Public"));

    expect(
      await screen.findByText("Public group is read-only — cannot be renamed or deleted."),
    ).toBeInTheDocument();
  });

  it("renders the Private header for user groups", async () => {
    mockGroupsResponse([groupWork]);

    renderWithProviders(<Sidebar />);

    expect(await screen.findByText("Private")).toBeInTheDocument();
    expect(await screen.findByText("Work")).toBeInTheDocument();
  });

  it("lists the group's notes in the context menu dropdown", async () => {
    mockGroupsResponse([groupWork]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Work");

    fireEvent.contextMenu(screen.getByText("Work"));

    expect(await screen.findByText("Notes")).toBeInTheDocument();
    // Tab titles also render inline in the sidebar now — scope to the menu
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("One")).toBeInTheDocument();
    expect(within(menu).getByText("Two")).toBeInTheDocument();
  });

  it("does not show a Notes section when the group has no tabs", async () => {
    mockGroupsResponse([groupPersonal]);

    renderWithProviders(<Sidebar />);
    await screen.findByText("Personal");

    fireEvent.contextMenu(screen.getByText("Personal"));

    expect(await screen.findByText("Rename")).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });
});

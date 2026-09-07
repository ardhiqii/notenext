import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileNotesDrawer from "@/components/mobile/mobile-notes-drawer";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useAuth } from "@/hooks/use-auth";
import { useActiveGroup } from "@/hooks/use-active-group";

const mocks = vi.hoisted(() => ({
  changeCurrentNote: vi.fn(),
  createNewNote: vi.fn(),
  toggleCollapse: vi.fn(),
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createGroup: vi.fn(),
}));

vi.mock("@/hooks/use-open-tabs", () => ({
  useOpenTabs: () => ({
    currentNoteId: "public-1",
    publicNotes: [
      {
        id: "public-1",
        title: "Welcome note",
        content: "",
        positionAt: 1,
        groupId: null,
      },
    ],
    tabsWithGroups: {
      groups: [
        {
          id: "group-1",
          name: "Work",
          positionAt: 1,
          collapsed: false,
          tabs: [
            {
              id: "private-1",
              title: "Private note",
              content: "",
              positionAt: 1,
              groupId: "group-1",
            },
          ],
        },
      ],
      ungroupedTabs: [
        {
          id: "ungrouped-1",
          title: "Loose note",
          content: "",
          positionAt: 2,
          groupId: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({
    changeCurrentNote: mocks.changeCurrentNote,
    createNewNote: mocks.createNewNote,
  }),
}));

vi.mock("@/queries", () => ({
  GroupMutations: {
    toggleCollapse: () => ({ mutate: mocks.toggleCollapse }),
    renameGroup: () => ({ mutate: mocks.renameGroup }),
    deleteGroup: () => ({ mutate: mocks.deleteGroup }),
    createGroup: () => ({ mutate: mocks.createGroup, isPending: false }),
  },
}));

describe("MobileNotesDrawer", () => {
  beforeEach(() => {
    useMobileUi.getState().reset();
    useMobileUi.getState().setSurface("notes");
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    useActiveGroup.setState({ activeGroupId: null });
    mocks.changeCurrentNote.mockReset();
    mocks.createNewNote.mockReset();
    mocks.toggleCollapse.mockReset();
    mocks.renameGroup.mockReset();
    mocks.deleteGroup.mockReset();
    mocks.createGroup.mockReset();
  });

  it("shows public notes to guests and closes after selection", () => {
    render(<MobileNotesDrawer />);

    expect(screen.getByRole("heading", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Welcome note" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Private" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Welcome note" }));
    expect(mocks.changeCurrentNote).toHaveBeenCalledWith("public-1");
    expect(useMobileUi.getState().surface).toBeNull();
  });

  it("shows private groups for logged-in users with explicit actions", () => {
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

    render(<MobileNotesDrawer />);

    expect(screen.getByRole("heading", { name: "Private" })).toBeInTheDocument();
    expect(screen.getByText("Private note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loose note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Work" })).toBeInTheDocument();
  });

  it("creates a private group from the compact drawer", () => {
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

    render(<MobileNotesDrawer />);

    fireEvent.click(screen.getByRole("button", { name: "Create a group" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New group name" }), {
      target: { value: "Personal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(mocks.createGroup).toHaveBeenCalledWith(
      { name: "Personal" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

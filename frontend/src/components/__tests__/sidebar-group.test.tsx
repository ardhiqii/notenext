import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import SidebarGroup from "@/components/sidebar-group";
import type { TabGroupWithTabs } from "@/types";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {
      role: "button",
      tabIndex: 0,
      "aria-roledescription": "sortable",
    },
    listeners: {},
    transform: null,
    transition: undefined,
    setNodeRef: () => {},
  }),
}));

const baseGroup: TabGroupWithTabs = {
  id: "g1",
  name: "Work",
  positionAt: 1,
  collapsed: false,
  tabs: [
    { id: "t1", title: "One", content: "", positionAt: 1, groupId: "g1" },
    { id: "t2", title: "Two", content: "", positionAt: 2, groupId: "g1" },
  ],
};

type GroupProps = {
  group: TabGroupWithTabs;
  isActive: boolean;
  currentNoteId?: string;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelect: () => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
  onContextMenu: (e: MouseEvent, group: TabGroupWithTabs) => void;
};

function renderGroup(overrides?: {
  group?: Partial<TabGroupWithTabs>;
  props?: Partial<GroupProps>;
}) {
  const group: TabGroupWithTabs = { ...baseGroup, ...overrides?.group };
  const props: GroupProps = {
    group,
    isActive: false,
    currentNoteId: undefined,
    onToggleCollapse: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSelect: vi.fn(),
    onCreateNote: vi.fn(),
    onSelectNote: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides?.props,
  };
  const utils = render(<SidebarGroup {...props} />);
  return { ...utils, props };
}

describe("SidebarGroup", () => {
  it("renders the group name and tab count", () => {
    renderGroup();

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders ChevronDown when expanded and ChevronRight when collapsed", () => {
    renderGroup();
    expect(screen.getByTitle("Collapse group")).toBeInTheDocument();
    expect(document.querySelector(".lucide-chevron-down")).not.toBeNull();

    renderGroup({ group: { collapsed: true } });
    expect(screen.getByTitle("Expand group")).toBeInTheDocument();
    expect(document.querySelector(".lucide-chevron-right")).not.toBeNull();
  });

  it("calls onToggleCollapse when the collapse toggle is clicked", async () => {
    const { props } = renderGroup();

    await userEvent.click(screen.getByTitle("Collapse group"));

    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("shows hover actions (new note + rename pencil + delete trash)", () => {
    renderGroup();

    expect(screen.getByTitle("New note in group")).toBeInTheDocument();
    expect(screen.getByTitle("Rename group")).toBeInTheDocument();
    expect(screen.getByTitle("Delete group")).toBeInTheDocument();
  });

  it("calls onCreateNote when the new-note button is clicked", async () => {
    const { props } = renderGroup();

    await userEvent.click(screen.getByTitle("New note in group"));

    expect(props.onCreateNote).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete when the delete button is clicked", async () => {
    const { props } = renderGroup();

    await userEvent.click(screen.getByTitle("Delete group"));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders a drag handle with dnd attributes", () => {
    renderGroup();

    const handle = screen.getByTitle("Drag to reorder");
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    expect(document.querySelector(".lucide-grip-vertical")).not.toBeNull();
  });

  it("opens inline rename on double-click and commits on blur", async () => {
    const { props } = renderGroup();

    await userEvent.dblClick(screen.getByText("Work"));

    const input = screen.getByDisplayValue("Work");
    expect(input).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "Personal");
    fireEvent.blur(input);

    expect(props.onRename).toHaveBeenCalledWith("Personal");
  });

  it("opens inline rename when the pencil hover action is clicked", async () => {
    renderGroup();
    await userEvent.click(screen.getByTitle("Rename group"));

    expect(screen.getByDisplayValue("Work")).toBeInTheDocument();
  });

  it("shows the empty-group hint when the group has no tabs", () => {
    renderGroup({ group: { tabs: [] } });

    expect(
      screen.getByText(/Click to create a note/),
    ).toBeInTheDocument();
  });

  it("hides the empty-group hint when the group has tabs", () => {
    renderGroup();

    expect(
      screen.queryByText(/Click to create a note/),
    ).not.toBeInTheDocument();
  });

  it("renders the group's tabs when expanded", () => {
    renderGroup();

    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  it("hides the group's tabs when collapsed", () => {
    renderGroup({ group: { collapsed: true } });

    expect(screen.queryByText("One")).not.toBeInTheDocument();
    expect(screen.queryByText("Two")).not.toBeInTheDocument();
  });

  it("calls onSelectNote when a tab is clicked", async () => {
    const { props } = renderGroup();

    await userEvent.click(screen.getByText("One"));

    expect(props.onSelectNote).toHaveBeenCalledWith("t1");
  });

  it("highlights the active tab", () => {
    renderGroup({ props: { currentNoteId: "t2" } });

    expect(screen.getByText("Two").className).toContain("bg-accent");
  });
});

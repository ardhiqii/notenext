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
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelect: () => void;
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
    onToggleCollapse: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSelect: vi.fn(),
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

  it("shows hover actions (rename pencil + delete trash)", () => {
    renderGroup();

    expect(screen.getByTitle("Rename group")).toBeInTheDocument();
    expect(screen.getByTitle("Delete group")).toBeInTheDocument();
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
      screen.getByText(/Drag tabs here or right-click a tab/),
    ).toBeInTheDocument();
  });

  it("hides the empty-group hint when the group has tabs", () => {
    renderGroup();

    expect(
      screen.queryByText(/Drag tabs here or right-click a tab/),
    ).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TabContextMenu from "@/components/tab-context-menu";
import type { Note, TabGroupWithTabs } from "@/types";

const baseTab: Note = {
  id: "t1",
  title: "Note One",
  content: "",
  positionAt: 1,
  groupId: null,
};

const baseGroups: TabGroupWithTabs[] = [
  { id: "g1", name: "Work", positionAt: 1, collapsed: false, tabs: [] },
  { id: "g2", name: "Personal", positionAt: 2, collapsed: false, tabs: [] },
];

type MenuProps = {
  tab: Note;
  groups: TabGroupWithTabs[];
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onCreateGroup: (name: string, tabId: string) => void;
  onAssignToGroup: (tabId: string, groupId: string) => void;
  onRemoveFromGroup: (tabId: string) => void;
};

function renderMenu(overrides?: {
  tab?: Note;
  groups?: TabGroupWithTabs[];
}) {
  const props: MenuProps = {
    tab: overrides?.tab ?? baseTab,
    groups: overrides?.groups ?? baseGroups,
    isOpen: true,
    position: { x: 10, y: 10 },
    onClose: vi.fn(),
    onCreateGroup: vi.fn(),
    onAssignToGroup: vi.fn(),
    onRemoveFromGroup: vi.fn(),
  };
  const utils = render(<TabContextMenu {...props} />);
  return { ...utils, props };
}

async function openCreateInput() {
  await userEvent.click(screen.getByText("Create New Group"));
  return screen.getByPlaceholderText("Group name...");
}

describe("TabContextMenu", () => {
  it("toggles the inline input when Create New Group is clicked", async () => {
    renderMenu();

    expect(screen.queryByPlaceholderText("Group name...")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Create New Group"));

    expect(screen.getByPlaceholderText("Group name...")).toBeInTheDocument();
  });

  it("submits the new group on Enter", async () => {
    const { props } = renderMenu();

    const input = await openCreateInput();
    await userEvent.type(input, "Team");
    await userEvent.keyboard("{Enter}");

    expect(props.onCreateGroup).toHaveBeenCalledWith("Team", "t1");
  });

  it("cancels creation on Escape", async () => {
    const { props } = renderMenu();

    const input = await openCreateInput();
    await userEvent.type(input, "Team");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Group name...")).not.toBeInTheDocument();
    expect(props.onCreateGroup).not.toHaveBeenCalled();
  });

  it("shows the Move to group submenu when groups exist", async () => {
    renderMenu();

    expect(screen.getByText("Move to group")).toBeInTheDocument();
  });

  it("hides the Move to group submenu when there are no groups", () => {
    renderMenu({ groups: [] });

    expect(screen.queryByText("Move to group")).not.toBeInTheDocument();
  });

  it("calls onAssignToGroup when a group is clicked in the submenu", async () => {
    const { props } = renderMenu();

    await userEvent.hover(screen.getByText("Move to group"));
    await userEvent.click(await screen.findByText("Work"));

    expect(props.onAssignToGroup).toHaveBeenCalledWith("t1", "g1");
  });

  it("shows a checkmark on the currently assigned group", async () => {
    renderMenu({ tab: { ...baseTab, groupId: "g1" } });

    await userEvent.hover(screen.getByText("Move to group"));
    const workItem = (await screen.findByText("Work")).closest(
      '[role="menuitem"]',
    );
    const personalItem = screen.getByText("Personal").closest(
      '[role="menuitem"]',
    );

    expect(workItem?.querySelector("svg")).not.toBeNull();
    expect(personalItem?.querySelector("svg")).toBeNull();
  });

  it("hides Remove from group when the tab has no group", () => {
    renderMenu({ tab: baseTab });

    expect(screen.queryByText("Remove from group")).not.toBeInTheDocument();
  });

  it("shows Remove from group when the tab is in a group", () => {
    renderMenu({ tab: { ...baseTab, groupId: "g1" } });

    expect(screen.getByText("Remove from group")).toBeInTheDocument();
  });

  it("calls onRemoveFromGroup when Remove from group is clicked", async () => {
    const { props } = renderMenu({ tab: { ...baseTab, groupId: "g1" } });

    await userEvent.click(screen.getByText("Remove from group"));

    expect(props.onRemoveFromGroup).toHaveBeenCalledWith("t1");
  });
});

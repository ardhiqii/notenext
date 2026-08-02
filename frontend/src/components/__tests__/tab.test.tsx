import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Tab from "@/components/tab";
import { useModal } from "@/hooks/use-modal";
import type { Note } from "@/types";

const notesMocks = vi.hoisted(() => ({
  changeCurrentNote: vi.fn(),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({
    closeNote: vi.fn(),
    renameTitleNote: vi.fn(),
    changeCurrentNote: notesMocks.changeCurrentNote,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useMatchRoute: () => () => undefined,
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    transform: null,
    transition: undefined,
    setNodeRef: () => {},
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

const baseTab: Note = {
  id: "t1",
  title: "Note One",
  content: "",
  positionAt: 1,
  groupId: null,
};

describe("Tab", () => {
  beforeEach(() => {
    useModal.setState({
      isOpen: false,
      modalType: null,
      modalData: null,
      callbacks: null,
      openModal: vi.fn(),
      closeModal: vi.fn(),
    });
    notesMocks.changeCurrentNote.mockReset();
  });

  it("shows the close button for a normal tab", () => {
    render(<Tab tab={baseTab} />);
    // The X icon renders inside a clickable div — grab the svg by class
    expect(document.querySelector(".lucide-x")).not.toBeNull();
  });

  it("hides the close button for a public tab", () => {
    render(<Tab tab={baseTab} isPublic />);
    expect(document.querySelector(".lucide-x")).toBeNull();
  });

  it("does not open rename on double-click for a public tab", () => {
    render(<Tab tab={baseTab} isPublic />);

    fireEvent.doubleClick(screen.getByText("Note One", { selector: "p" }));
    // Public tabs never enter inline-edit mode → no input appears
    expect(document.querySelector("input")).toBeNull();
  });

  it("opens rename on double-click for a normal tab", () => {
    render(<Tab tab={baseTab} />);

    fireEvent.doubleClick(screen.getByText("Note One", { selector: "p" }));
    expect(document.querySelector("input")).not.toBeNull();
  });

  it("does not open the context menu for a public tab", () => {
    const onContextMenu = vi.fn();
    render(<Tab tab={baseTab} isPublic onContextMenu={onContextMenu} />);

    fireEvent.contextMenu(screen.getByText("Note One", { selector: "p" }));
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("opens the context menu for a normal tab", () => {
    const onContextMenu = vi.fn();
    render(<Tab tab={baseTab} onContextMenu={onContextMenu} />);

    fireEvent.contextMenu(screen.getByText("Note One", { selector: "p" }));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("selects the note when clicked (public or not)", () => {
    render(<Tab tab={baseTab} isPublic />);
    fireEvent.click(screen.getByText("Note One", { selector: "p" }));

    expect(notesMocks.changeCurrentNote).toHaveBeenCalledWith("t1");
  });
});

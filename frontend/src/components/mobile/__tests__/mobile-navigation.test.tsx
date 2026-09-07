import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileBottomNav from "@/components/mobile/mobile-bottom-nav";
import MobileTopBar from "@/components/mobile/mobile-top-bar";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useModal } from "@/hooks/use-modal";

const mocks = vi.hoisted(() => ({
  createNewNote: vi.fn(),
  changeCurrentNote: vi.fn(),
}));

vi.mock("@/hooks/use-open-tabs", () => ({
  useOpenTabs: () => ({
    currentNoteId: "note-1",
    notes: [
      {
        id: "note-1",
        title: "A note with a long title",
        content: "",
        positionAt: 1,
        groupId: null,
      },
    ],
    publicNotes: [],
    visibleTabs: [
      {
        id: "note-1",
        title: "A note with a long title",
        content: "",
        positionAt: 1,
        groupId: null,
      },
    ],
    tabsWithGroups: undefined,
    publicNoteIds: new Set<string>(),
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({
    createNewNote: mocks.createNewNote,
    changeCurrentNote: mocks.changeCurrentNote,
  }),
}));

describe("compact mobile navigation", () => {
  beforeEach(() => {
    useMobileUi.getState().reset();
    useModal.setState({
      type: null,
      isOpen: false,
      data: {},
      callback: {},
    });
    mocks.createNewNote.mockReset();
    mocks.changeCurrentNote.mockReset();
  });

  it("exposes labeled notes and tabs controls and keeps one surface open", () => {
    render(<MobileTopBar />);

    fireEvent.click(screen.getByRole("button", { name: "Open notes" }));
    expect(useMobileUi.getState().surface).toBe("notes");
    expect(screen.getByRole("button", { name: "Open notes" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open tabs" }));
    expect(useMobileUi.getState().surface).toBe("tabs");
    expect(screen.getByText("A note with a long title")).toBeInTheDocument();
  });

  it("routes search, creation, and menu actions to their existing owners", () => {
    render(<MobileBottomNav />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(useModal.getState().type).toBe("search-note");
    expect(useModal.getState().isOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    expect(mocks.createNewNote).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(useMobileUi.getState().surface).toBe("menu");
  });

  it("does not leave the navigation dock over a visible keyboard", () => {
    useMobileUi.getState().setKeyboardVisible(true);

    render(<MobileBottomNav />);

    expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
  });
});

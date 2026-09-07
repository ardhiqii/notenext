import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileTabsOverview from "@/components/mobile/mobile-tabs-overview";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useModal } from "@/hooks/use-modal";

const mocks = vi.hoisted(() => ({
  changeCurrentNote: vi.fn(),
  closeNote: vi.fn(),
  renameTitleNote: vi.fn(),
}));

vi.mock("@/hooks/use-open-tabs", () => ({
  useOpenTabs: () => ({
    currentNoteId: "private-1",
    visibleTabs: [
      {
        id: "public-1",
        title: "Welcome",
        content: "",
        positionAt: 1,
        groupId: null,
      },
      {
        id: "private-1",
        title: "Private note",
        content: "",
        positionAt: 2,
        groupId: null,
      },
    ],
    publicNoteIds: new Set(["public-1"]),
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({
    changeCurrentNote: mocks.changeCurrentNote,
    closeNote: mocks.closeNote,
    renameTitleNote: mocks.renameTitleNote,
  }),
}));

describe("MobileTabsOverview", () => {
  beforeEach(() => {
    useMobileUi.getState().reset();
    useMobileUi.getState().setSurface("tabs");
    useModal.setState({
      type: null,
      isOpen: false,
      data: {},
      callback: {},
    });
    mocks.changeCurrentNote.mockReset();
    mocks.closeNote.mockReset();
    mocks.renameTitleNote.mockReset();
  });

  it("protects public rows and switches private notes through useNotes", () => {
    render(<MobileTabsOverview />);

    expect(screen.queryByRole("button", { name: "Close Welcome" })).toBeNull();
    fireEvent.click(screen.getByText("Welcome"));
    expect(mocks.changeCurrentNote).toHaveBeenCalledWith("public-1");
  });

  it("uses the existing delete modal and commits a rename once", () => {
    render(<MobileTabsOverview />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Private note" }));
    const input = screen.getByRole("textbox", { name: "Rename Private note" });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(mocks.renameTitleNote).toHaveBeenCalledOnce();
    expect(mocks.renameTitleNote).toHaveBeenCalledWith("private-1", "Renamed");

    fireEvent.click(screen.getByRole("button", { name: "Close Private note" }));
    expect(useModal.getState().type).toBe("delete-note");
    expect(useModal.getState().callback.deleteNote).toBe(mocks.closeNote);
  });
});

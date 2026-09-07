import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "../_app";
import { useMobileUi } from "@/hooks/use-mobile-ui";

const mocks = vi.hoisted(() => ({
  useHotkey: vi.fn(),
  openModal: vi.fn(),
  changeCurrentNote: vi.fn(),
  createNewNote: vi.fn(),
}));

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: mocks.useHotkey,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Outlet: () => null,
  useMatchRoute: () => () => undefined,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

vi.mock("@/hooks/use-modal", () => ({
  useModal: (selector: (state: { openModal: typeof mocks.openModal }) => unknown) =>
    selector({ openModal: mocks.openModal }),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({
    changeCurrentNote: mocks.changeCurrentNote,
    createNewNote: mocks.createNewNote,
  }),
}));

vi.mock("@/hooks/use-sidebar", () => ({
  default: () => ({ collapsed: false, toggle: vi.fn() }),
}));

vi.mock("@/hooks/use-visual-viewport", () => ({
  useVisualViewportKeyboard: vi.fn(),
}));

vi.mock("@/components/tabs-bar", () => ({ default: () => null }));
vi.mock("@/components/sidebar", () => ({ default: () => null }));
vi.mock("@/components/activity-bar", () => ({ default: () => null }));
vi.mock("@/components/mobile", () => ({
  MobileBottomNav: () => null,
  MobileMenu: () => null,
  MobileNotesDrawer: () => null,
  MobileTabsOverview: () => null,
  MobileTopBar: () => null,
}));

describe("AppLayout mobile lifecycle", () => {
  beforeEach(() => {
    mocks.useHotkey.mockReset();
    mocks.openModal.mockReset();
    mocks.changeCurrentNote.mockReset();
    mocks.createNewNote.mockReset();
    useMobileUi.getState().reset();
  });

  it("resets compact UI before Mod+K opens global search", () => {
    render(<AppLayout />);
    const modKHandler = mocks.useHotkey.mock.calls.find(
      ([hotkey]) => hotkey === "Mod+K",
    )?.[1] as (() => void) | undefined;

    expect(modKHandler).toBeTypeOf("function");

    act(() => {
      useMobileUi.getState().setSurface("menu");
      useMobileUi.getState().setEditorFocused(true);
      useMobileUi.getState().setKeyboardVisible(true);
      modKHandler?.();
    });

    expect(useMobileUi.getState()).toMatchObject({
      surface: null,
      editorFocused: false,
      keyboardVisible: false,
    });
    expect(mocks.openModal).toHaveBeenCalledWith("search-note", {
      callback: { changeCurrentNote: mocks.changeCurrentNote },
    });
  });
});

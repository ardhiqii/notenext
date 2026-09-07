import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileUi } from "../use-mobile-ui";
import { useVisualViewportKeyboard } from "../use-visual-viewport";

type ViewportListener = EventListener;

const viewportListeners = new Map<string, ViewportListener>();
const viewport = {
  height: 800,
  addEventListener: vi.fn((type: string, listener: EventListener) => {
    viewportListeners.set(type, listener);
  }),
  removeEventListener: vi.fn((type: string) => {
    viewportListeners.delete(type);
  }),
};

function setWindowHeight(height: number) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function emitViewportResize() {
  viewportListeners.get("resize")?.(new Event("resize"));
}

describe("useVisualViewportKeyboard", () => {
  beforeEach(() => {
    useMobileUi.getState().reset();
    viewport.height = 800;
    setWindowHeight(800);
    viewportListeners.clear();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });

  it("keeps the full viewport as the baseline when focus opens the keyboard", () => {
    renderHook(() => useVisualViewportKeyboard());

    viewport.height = 500;
    act(() => useMobileUi.getState().setEditorFocused(true));
    act(emitViewportResize);

    expect(useMobileUi.getState().keyboardVisible).toBe(true);
  });

  it("clears keyboard state when the keyboard is dismissed while the editor stays focused", () => {
    renderHook(() => useVisualViewportKeyboard());
    act(() => useMobileUi.getState().setEditorFocused(true));

    viewport.height = 500;
    act(emitViewportResize);
    expect(useMobileUi.getState().keyboardVisible).toBe(true);

    viewport.height = 800;
    act(emitViewportResize);
    expect(useMobileUi.getState().keyboardVisible).toBe(false);
  });

  it("resets the baseline for a split-screen window resize", () => {
    renderHook(() => useVisualViewportKeyboard());
    act(() => useMobileUi.getState().setEditorFocused(true));

    setWindowHeight(480);
    viewport.height = 480;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(useMobileUi.getState().keyboardVisible).toBe(false);

    // Some browsers deliver the visual viewport resize after window.resize.
    act(emitViewportResize);
    expect(useMobileUi.getState().keyboardVisible).toBe(false);
  });

  it("resets the baseline after orientation changes while the editor stays focused", () => {
    renderHook(() => useVisualViewportKeyboard());
    act(() => useMobileUi.getState().setEditorFocused(true));

    viewport.height = 500;
    act(emitViewportResize);
    expect(useMobileUi.getState().keyboardVisible).toBe(true);

    setWindowHeight(600);
    viewport.height = 600;
    act(() => window.dispatchEvent(new Event("orientationchange")));
    expect(useMobileUi.getState().keyboardVisible).toBe(false);

    act(emitViewportResize);
    expect(useMobileUi.getState().keyboardVisible).toBe(false);
  });
});
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileUi } from "../use-mobile-ui";
import { useVisualViewportKeyboard } from "../use-visual-viewport";

type ViewportListener = () => void;

const listeners = new Map<string, ViewportListener>();
const viewport = {
  height: 800,
  addEventListener: vi.fn((type: string, listener: EventListener) => {
    listeners.set(type, listener as ViewportListener);
  }),
  removeEventListener: vi.fn((type: string) => {
    listeners.delete(type);
  }),
};

describe("useVisualViewportKeyboard", () => {
  beforeEach(() => {
    useMobileUi.getState().reset();
    viewport.height = 800;
    listeners.clear();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });

  it("keeps the full viewport as the baseline when focus opens the keyboard", () => {
    renderHook(() => useVisualViewportKeyboard());

    viewport.height = 500;
    act(() => useMobileUi.getState().setEditorFocused(true));

    expect(useMobileUi.getState().keyboardVisible).toBe(true);
  });
});
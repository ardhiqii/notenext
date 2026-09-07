import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMobileUi } from "../use-mobile-ui";

const resetStore = () => {
  useMobileUi.getState().reset();
};

describe("useMobileUi", () => {
  beforeEach(resetStore);

  it("keeps only one mobile surface open", () => {
    act(() => useMobileUi.getState().setSurface("notes"));
    expect(useMobileUi.getState().surface).toBe("notes");

    act(() => useMobileUi.getState().toggleSurface("tabs"));
    expect(useMobileUi.getState().surface).toBe("tabs");

    act(() => useMobileUi.getState().toggleSurface("tabs"));
    expect(useMobileUi.getState().surface).toBeNull();
  });

  it("does not persist focus or keyboard state", () => {
    const { result } = renderHook(() => useMobileUi());

    act(() => {
      result.current.setEditorFocused(true);
      result.current.setKeyboardVisible(true);
    });

    expect(result.current.editorFocused).toBe(true);
    expect(result.current.keyboardVisible).toBe(true);

    act(() => result.current.reset());

    expect(result.current).toMatchObject({
      surface: null,
      editorFocused: false,
      keyboardVisible: false,
    });
  });
});

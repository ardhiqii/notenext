import { useEffect, useRef } from "react";
import { useMobileUi } from "./use-mobile-ui";

const KEYBOARD_HEIGHT_THRESHOLD = 120;

/**
 * Converts the visual viewport resize caused by a software keyboard into a
 * discrete store value. The listener is scoped to the app shell and is always
 * removed on unmount, so collaboration and editor state remain independent.
 */
export function useVisualViewportKeyboard() {
  const editorFocused = useMobileUi((state) => state.editorFocused);
  const setKeyboardVisible = useMobileUi((state) => state.setKeyboardVisible);
  const editorFocusedRef = useRef(false);
  const baselineHeightRef = useRef<number | null>(null);
  const syncKeyboardStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    editorFocusedRef.current = editorFocused;
    syncKeyboardStateRef.current?.();
  }, [editorFocused]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    const readHeight = () => viewport?.height ?? window.innerHeight;
    const syncViewportHeight = (height: number) => {
      if (height > 0) {
        document.documentElement.style.setProperty(
          "--notenext-visual-height",
          `${height}px`,
        );
      }
    };

    const initialHeight = readHeight();
    baselineHeightRef.current = initialHeight;
    syncViewportHeight(initialHeight);
    setKeyboardVisible(false);

    const updateKeyboardState = () => {
      const height = readHeight();
      syncViewportHeight(height);

      if (!editorFocusedRef.current) {
        baselineHeightRef.current = height;
        setKeyboardVisible(false);
        return;
      }

      const baseline = baselineHeightRef.current ?? height;
      if (height > baseline) {
        baselineHeightRef.current = height;
      }

      setKeyboardVisible(
        (baselineHeightRef.current ?? height) - height >
          KEYBOARD_HEIGHT_THRESHOLD,
      );
    };

    syncKeyboardStateRef.current = updateKeyboardState;
    updateKeyboardState();

    viewport?.addEventListener("resize", updateKeyboardState);
    viewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    window.addEventListener("orientationchange", updateKeyboardState);

    return () => {
      viewport?.removeEventListener("resize", updateKeyboardState);
      viewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      window.removeEventListener("orientationchange", updateKeyboardState);
      syncKeyboardStateRef.current = null;
      document.documentElement.style.removeProperty("--notenext-visual-height");
      setKeyboardVisible(false);
    };
  }, [setKeyboardVisible]);
}

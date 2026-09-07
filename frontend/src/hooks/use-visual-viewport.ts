import { useEffect, useRef } from "react";
import { useMobileUi } from "./use-mobile-ui";

const KEYBOARD_HEIGHT_THRESHOLD = 120;
type ViewportEventSource = "viewport" | "window" | "orientation";

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
  const layoutHeightRef = useRef<number | null>(null);
  const syncKeyboardStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    editorFocusedRef.current = editorFocused;
    syncKeyboardStateRef.current?.();
  }, [editorFocused]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    const readHeight = () => viewport?.height ?? window.innerHeight;
    const readLayoutHeight = () => window.innerHeight || readHeight();
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
    layoutHeightRef.current = readLayoutHeight();
    syncViewportHeight(initialHeight);
    setKeyboardVisible(false);

    const updateKeyboardState = (
      source: ViewportEventSource = "viewport",
    ) => {
      const height = readHeight();
      const layoutHeight = readLayoutHeight();
      syncViewportHeight(height);

      if (!editorFocusedRef.current) {
        baselineHeightRef.current = height;
        setKeyboardVisible(false);
        layoutHeightRef.current = layoutHeight;
        return;
      }

      const layoutChanged =
        layoutHeightRef.current !== null &&
        layoutHeightRef.current !== layoutHeight;
      const keyboardOffset = layoutHeight - height > KEYBOARD_HEIGHT_THRESHOLD;

      // A rotation or layout resize establishes a new viewport baseline. A
      // real keyboard resize normally changes only visualViewport, keeping
      // window.innerHeight stable; that offset remains keyboard-aware.
      if (source === "orientation") {
        baselineHeightRef.current = layoutHeight;
        setKeyboardVisible(false);
      } else if (keyboardOffset) {
        setKeyboardVisible(true);
      } else if (layoutChanged || source === "window") {
        baselineHeightRef.current = layoutHeight;
        setKeyboardVisible(false);
      } else {
        const baseline = baselineHeightRef.current ?? height;
        if (height > baseline) {
          baselineHeightRef.current = height;
        }
        setKeyboardVisible(
          (baselineHeightRef.current ?? height) - height >
            KEYBOARD_HEIGHT_THRESHOLD,
        );
      }

      layoutHeightRef.current = layoutHeight;
    };

    syncKeyboardStateRef.current = updateKeyboardState;
    updateKeyboardState();

    const handleViewportResize = () => updateKeyboardState("viewport");
    const handleViewportScroll = () => updateKeyboardState("viewport");
    const handleWindowResize = () => updateKeyboardState("window");
    const handleOrientationChange = () => updateKeyboardState("orientation");

    viewport?.addEventListener("resize", handleViewportResize);
    viewport?.addEventListener("scroll", handleViewportScroll);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      viewport?.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("scroll", handleViewportScroll);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      syncKeyboardStateRef.current = null;
      document.documentElement.style.removeProperty("--notenext-visual-height");
      setKeyboardVisible(false);
    };
  }, [setKeyboardVisible]);
}

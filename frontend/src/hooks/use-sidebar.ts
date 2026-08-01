import { useCallback, useState } from "react";

const STORAGE_KEY = "notenext.sidebar-collapsed";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Obsidian-style hide/show navigation state, persisted to localStorage.
 * Collapsed = sidebar hidden (tabs strip stays on top).
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // storage unavailable (private mode etc.) — state still works
      }
      return next;
    });
  }, []);

  const setCollapsedValue = useCallback((value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  return { collapsed, toggle, setCollapsed: setCollapsedValue };
}

export default useSidebar;

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useSidebar from "../use-sidebar";

describe("useSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to expanded when no stored preference", () => {
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);
  });

  it("reads collapsed=1 from localStorage", () => {
    window.localStorage.setItem("notenext.sidebar-collapsed", "1");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);
  });

  it("reads collapsed=0 from localStorage", () => {
    window.localStorage.setItem("notenext.sidebar-collapsed", "0");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle flips state and persists", () => {
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem("notenext.sidebar-collapsed")).toBe("1");

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem("notenext.sidebar-collapsed")).toBe("0");
  });

  it("setCollapsed writes explicit value", () => {
    const { result } = renderHook(() => useSidebar());
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem("notenext.sidebar-collapsed")).toBe("1");

    act(() => result.current.setCollapsed(false));
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem("notenext.sidebar-collapsed")).toBe("0");
  });

  it("guards against unavailable localStorage", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);

    expect(() => act(() => result.current.toggle())).not.toThrow();
    expect(result.current.collapsed).toBe(true);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

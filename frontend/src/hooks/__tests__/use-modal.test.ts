import { describe, expect, it, beforeEach } from "vitest";
import { useModal } from "../use-modal";

describe("useModal store", () => {
  beforeEach(() => {
    useModal.setState({ type: null, isOpen: false, data: {}, callback: {} });
  });

  it("keeps data as an object when opened without options", () => {
    useModal.getState().openModal("connection-note");

    const state = useModal.getState();
    expect(state.isOpen).toBe(true);
    expect(state.type).toBe("connection-note");
    // openModal("connection-note") passes no options — data must not become
    // undefined, or modals reading data.noteId in render (export modal)
    // would crash with "Cannot read properties of undefined".
    expect(state.data).toEqual({});
    expect(state.data).not.toBeUndefined();
  });

  it("stores the provided data when opened with options", () => {
    useModal.getState().openModal("export-note", {
      data: { noteId: "n1" },
    });

    expect(useModal.getState().data).toEqual({ noteId: "n1" });
  });

  it("keeps callback as an object when opened without options", () => {
    useModal.getState().openModal("changelog");

    expect(useModal.getState().callback).toEqual({});
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileEditorToolbar from "../mobile-editor-toolbar";

const props = () => ({
  onAction: vi.fn(),
  onDone: vi.fn(),
  wordWrap: false,
  onToggleWordWrap: vi.fn(),
});

describe("MobileEditorToolbar", () => {
  it("exposes named markdown actions and sends the selected action", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));

    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onDone).toHaveBeenCalledOnce();
  });

  it("reveals secondary actions without losing the primary row", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "More editor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Word wrap" }));

    expect(toolbarProps.onAction).toHaveBeenCalledWith("select-all");
    expect(toolbarProps.onToggleWordWrap).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Done editing" })).toBeInTheDocument();
  });

  it("fires pointer actions once without double-triggering the follow-up click", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    const bold = screen.getByRole("button", { name: "Bold" });
    fireEvent.pointerDown(bold);
    fireEvent.click(bold, { detail: 1 });

    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onAction).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileEditorToolbar from "../mobile-editor-toolbar";

const props = () => ({
  onAction: vi.fn(),
  onDone: vi.fn(),
  onFocusEditor: vi.fn(),
  moreActionsOpen: false,
  onMoreActionsOpenChange: vi.fn(),
});

describe("MobileEditorToolbar", () => {
  it("exposes the primary actions and sends the selected action", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));

    expect(toolbarProps.onAction).toHaveBeenNthCalledWith(1, "undo");
    expect(toolbarProps.onAction).toHaveBeenNthCalledWith(2, "redo");
    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onDone).toHaveBeenCalledOnce();
  });

  it("reports controlled More state through its accessible trigger", () => {
    const toolbarProps = props();
    const { rerender } = render(<MobileEditorToolbar {...toolbarProps} />);

    const moreButton = screen.getByRole("button", {
      name: "More editor actions",
    });
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveAttribute(
      "aria-controls",
      "mobile-editor-more-actions",
    );

    fireEvent.pointerDown(moreButton, { pointerType: "touch" });
    fireEvent.click(moreButton, { detail: 0 });
    expect(toolbarProps.onMoreActionsOpenChange).toHaveBeenCalledWith(true);
    expect(toolbarProps.onMoreActionsOpenChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <MobileEditorToolbar {...toolbarProps} moreActionsOpen={true} />,
    );
    expect(screen.getByRole("button", { name: "More editor actions" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("fires pointer actions once without relying on click detail", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    const bold = screen.getByRole("button", { name: "Bold" });
    fireEvent.pointerDown(bold, { pointerType: "touch" });
    fireEvent.click(bold, { detail: 0 });

    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onAction).toHaveBeenCalledTimes(1);
  });

  it("uses the click fallback for keyboard activation without a pointer event", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    const bold = screen.getByRole("button", { name: "Bold" });
    fireEvent.click(bold, { detail: 0 });

    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onAction).toHaveBeenCalledOnce();
  });
});

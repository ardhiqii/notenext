import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileEditorToolbar from "../mobile-editor-toolbar";

const props = () => ({
  onAction: vi.fn(),
  onDone: vi.fn(),
  wordWrap: false,
  onToggleWordWrap: vi.fn(),
  onFocusEditor: vi.fn(),
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

  it("opens secondary actions in a dismissible action sheet", async () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "More editor actions" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "More editor actions" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    await waitFor(() => {
      expect(toolbarProps.onAction).toHaveBeenCalledWith("select-all");
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done editing" })).toBeInTheDocument();
  });

  it("closes after toggling word wrap and exposes its pressed state", async () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} wordWrap={false} />);

    fireEvent.click(screen.getByRole("button", { name: "More editor actions" }));
    const wordWrap = screen.getByRole("button", { name: "Word wrap" });
    expect(wordWrap).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(wordWrap);
    await waitFor(() => {
      expect(toolbarProps.onToggleWordWrap).toHaveBeenCalledOnce();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toolbarProps.onFocusEditor).toHaveBeenCalled();
  });

  it("sends the divider action from the secondary sheet", async () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "More editor actions" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Insert horizontal rule" }),
    );

    await waitFor(() => {
      expect(toolbarProps.onAction).toHaveBeenCalledWith("horizontal-rule");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses the sheet with its close affordance and restores editor focus", async () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "More editor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toolbarProps.onFocusEditor).toHaveBeenCalled();
    });
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

  it("uses the click fallback for keyboard activation without a pointer event", () => {
    const toolbarProps = props();
    render(<MobileEditorToolbar {...toolbarProps} />);

    const bold = screen.getByRole("button", { name: "Bold" });
    fireEvent.click(bold, { detail: 0 });

    expect(toolbarProps.onAction).toHaveBeenCalledWith("bold");
    expect(toolbarProps.onAction).toHaveBeenCalledOnce();
  });
});

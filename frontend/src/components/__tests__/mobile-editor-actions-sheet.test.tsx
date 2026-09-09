import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import MobileEditorActionsSheet from "../mobile-editor-actions-sheet";
import MobileEditorToolbar, {
  type MobileEditorAction,
} from "../mobile-editor-toolbar";

type ControlledEditorSurfaceProps = {
  onAction: (action: MobileEditorAction) => void;
  onToggleWordWrap: () => void;
  onFocusEditor: () => void;
};

const ControlledEditorSurface = ({
  onAction,
  onToggleWordWrap,
  onFocusEditor,
}: ControlledEditorSurfaceProps) => {
  const [keyboardVisible, setKeyboardVisible] = useState(true);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

  const handleMoreActionsOpenChange = (nextOpen: boolean) => {
    setMoreActionsOpen(nextOpen);
    if (nextOpen) setKeyboardVisible(false);
  };

  return (
    <>
      {keyboardVisible && (
        <MobileEditorToolbar
          onAction={onAction}
          onDone={vi.fn()}
          onFocusEditor={onFocusEditor}
          moreActionsOpen={moreActionsOpen}
          onMoreActionsOpenChange={handleMoreActionsOpenChange}
        />
      )}
      <MobileEditorActionsSheet
        open={moreActionsOpen}
        onOpenChange={setMoreActionsOpen}
        wordWrap={false}
        onToggleWordWrap={onToggleWordWrap}
        onAction={onAction}
        onFocusEditor={onFocusEditor}
      />
    </>
  );
};

describe("MobileEditorActionsSheet", () => {
  it("keeps the More sheet open after a touch trigger and follow-up click", async () => {
    const onAction = vi.fn();
    const onToggleWordWrap = vi.fn();
    const onFocusEditor = vi.fn();

    const ControlledSurface = () => {
      const [open, setOpen] = useState(false);

      return (
        <>
          <MobileEditorToolbar
            onAction={onAction}
            onDone={vi.fn()}
            onFocusEditor={onFocusEditor}
            moreActionsOpen={open}
            onMoreActionsOpenChange={setOpen}
          />
          <MobileEditorActionsSheet
            open={open}
            onOpenChange={setOpen}
            wordWrap={false}
            onToggleWordWrap={onToggleWordWrap}
            onAction={onAction}
            onFocusEditor={onFocusEditor}
          />
        </>
      );
    };

    render(<ControlledSurface />);
    const moreButton = screen.getByRole("button", {
      name: "More editor actions",
    });

    fireEvent.pointerDown(moreButton, { pointerType: "touch" });
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    fireEvent.click(moreButton, { detail: 0 });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(moreButton).toHaveAttribute("aria-expanded", "true");
  });

  it("ignores the opening More trigger as an outside pointerdown", async () => {
    const ControlledSurface = () => {
      const [open, setOpen] = useState(true);
      const onOpenChange = vi.fn((nextOpen: boolean) => setOpen(nextOpen));

      return (
        <>
          <button type="button" aria-label="More editor actions">
            More
          </button>
          <MobileEditorActionsSheet
            open={open}
            onOpenChange={onOpenChange}
            wordWrap={false}
            onToggleWordWrap={vi.fn()}
            onAction={vi.fn()}
            onFocusEditor={vi.fn()}
          />
        </>
      );
    };

    render(<ControlledSurface />);
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "More editor actions",
        hidden: true,
      }),
      { pointerType: "mouse" },
    );

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still dismisses after a pointerdown elsewhere", async () => {
    const ControlledSurface = () => {
      const [open, setOpen] = useState(true);

      return (
        <>
          <button type="button" data-testid="outside-target">
            Outside
          </button>
          <MobileEditorActionsSheet
            open={open}
            onOpenChange={setOpen}
            wordWrap={false}
            onToggleWordWrap={vi.fn()}
            onAction={vi.fn()}
            onFocusEditor={vi.fn()}
          />
        </>
      );
    };

    render(<ControlledSurface />);
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    fireEvent.pointerDown(screen.getByTestId("outside-target"), {
      pointerType: "mouse",
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("stays mounted when the keyboard toolbar unmounts and closes after an action", async () => {
    const onAction = vi.fn();
    const onToggleWordWrap = vi.fn();
    const onFocusEditor = vi.fn();

    render(
      <ControlledEditorSurface
        onAction={onAction}
        onToggleWordWrap={onToggleWordWrap}
        onFocusEditor={onFocusEditor}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More editor actions" }),
    );

    expect(screen.queryByTestId("mobile-editor-toolbar")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const selectAll = screen.getByRole("button", { name: "Select all" });
    fireEvent.pointerDown(selectAll, { pointerType: "touch" });
    fireEvent.click(selectAll, { detail: 0 });

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("select-all");
      expect(onAction).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onFocusEditor).toHaveBeenCalled();
    });
  });

  it("routes word wrap and divider actions through controlled close", async () => {
    const onAction = vi.fn();
    const onToggleWordWrap = vi.fn();
    const onFocusEditor = vi.fn();

    const ControlledSheet = () => {
      const [open, setOpen] = useState(true);

      return (
        <MobileEditorActionsSheet
          open={open}
          onOpenChange={setOpen}
          wordWrap={false}
          onToggleWordWrap={onToggleWordWrap}
          onAction={onAction}
          onFocusEditor={onFocusEditor}
        />
      );
    };

    const { rerender } = render(<ControlledSheet />);
    expect(screen.getByRole("button", { name: "Word wrap" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Word wrap" }));
    await waitFor(() => {
      expect(onToggleWordWrap).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onFocusEditor).toHaveBeenCalled();
    });

    rerender(<ControlledSheet key="second-open" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Insert horizontal rule" }),
    );

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("horizontal-rule");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("dismisses through Radix close and restores editor focus", async () => {
    const onFocusEditor = vi.fn();

    const ControlledSheet = () => {
      const [open, setOpen] = useState(true);

      return (
        <MobileEditorActionsSheet
          open={open}
          onOpenChange={setOpen}
          wordWrap={false}
          onToggleWordWrap={vi.fn()}
          onAction={vi.fn()}
          onFocusEditor={onFocusEditor}
        />
      );
    };

    render(<ControlledSheet />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onFocusEditor).toHaveBeenCalled();
    });
  });
});

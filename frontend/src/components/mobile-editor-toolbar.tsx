import {
  Bold,
  Check,
  Code2,
  Heading2,
  Italic,
  Link,
  List,
  MoreHorizontal,
  Redo2,
  Undo2,
} from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

export type MobileEditorAction =
  | "undo"
  | "redo"
  | "heading"
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "list"
  | "select-all"
  | "horizontal-rule";

type MobileEditorToolbarProps = {
  onAction: (action: MobileEditorAction) => void;
  onDone: () => void;
  onFocusEditor: () => void;
  moreActionsOpen: boolean;
  onMoreActionsOpenChange: (open: boolean) => void;
};

const iconButtonClass =
  "size-11 shrink-0 rounded-md text-muted-foreground active:scale-95";

type MobileActionButtonProps = ComponentProps<typeof Button> & {
  action: () => void;
};

const MobileActionButton = ({ action, ...props }: MobileActionButtonProps) => (
  <Button
    {...props}
    onPointerDown={(event) => {
      event.preventDefault();
      action();
    }}
    onClick={(event) => {
      if (event.detail === 0) action();
    }}
  />
);

const MobileEditorToolbar = ({
  onAction,
  onDone,
  onFocusEditor,
  moreActionsOpen,
  onMoreActionsOpenChange,
}: MobileEditorToolbarProps) => {
  const toggleMoreActions = () => {
    const nextVisible = !moreActionsOpen;
    onMoreActionsOpenChange(nextVisible);
    if (!nextVisible) window.requestAnimationFrame(onFocusEditor);
  };

  return (
    <div
      data-testid="mobile-editor-toolbar"
      className="safe-area-bottom border-t bg-background lg:hidden"
    >
      <div
        role="toolbar"
        className="flex min-h-14 items-center gap-1 px-2 py-1"
        aria-label="Editor actions"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Undo"
            action={() => onAction("undo")}
          >
            <Undo2 />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Redo"
            action={() => onAction("redo")}
          >
            <Redo2 />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Heading"
            action={() => onAction("heading")}
          >
            <Heading2 />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Bold"
            action={() => onAction("bold")}
          >
            <Bold />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Italic"
            action={() => onAction("italic")}
          >
            <Italic />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Inline code"
            action={() => onAction("code")}
          >
            <Code2 />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="Link"
            action={() => onAction("link")}
          >
            <Link />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            aria-label="List"
            action={() => onAction("list")}
          >
            <List />
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant={moreActionsOpen ? "secondary" : "ghost"}
            size="icon"
            className={iconButtonClass}
            aria-expanded={moreActionsOpen}
            aria-controls="mobile-editor-more-actions"
            aria-haspopup="dialog"
            aria-label="More editor actions"
            action={toggleMoreActions}
          >
            <MoreHorizontal />
          </MobileActionButton>
        </div>
        <MobileActionButton
          type="button"
          variant="secondary"
          className="min-h-11 shrink-0 gap-1 px-3"
          aria-label="Done editing"
          action={onDone}
        >
          <Check />
          <span>Done</span>
        </MobileActionButton>
      </div>
    </div>
  );
};

export default MobileEditorToolbar;

import {
  Bold,
  Code2,
  Heading2,
  Italic,
  Link,
  List,
  MoreHorizontal,
  Rows3,
  TextSelect,
  WrapText,
  X,
} from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MobileEditorAction =
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
  wordWrap: boolean;
  onToggleWordWrap: () => void;
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
  wordWrap,
  onToggleWordWrap,
}: MobileEditorToolbarProps) => {
  const [showMore, setShowMore] = useState(false);

  return (
    <div
      data-testid="mobile-editor-toolbar"
      className="safe-area-bottom border-t bg-background lg:hidden"
    >
      <div
        className="flex min-h-14 items-center gap-1 px-2 py-1"
        aria-label="Editor actions"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
            variant={showMore ? "secondary" : "ghost"}
            size="icon"
            className={iconButtonClass}
            aria-expanded={showMore}
            aria-controls="mobile-editor-more-actions"
            aria-label="More editor actions"
            action={() => setShowMore((visible) => !visible)}
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
          <X />
          <span>Done</span>
        </MobileActionButton>
      </div>

      {showMore && (
        <div
          id="mobile-editor-more-actions"
          className="flex items-center gap-1 overflow-x-auto border-t px-2 py-1"
          aria-label="More editor actions"
        >
          <MobileActionButton
            type="button"
            variant="ghost"
            className={cn("min-h-11 shrink-0 gap-2", wordWrap && "text-primary")}
            aria-pressed={wordWrap}
            action={onToggleWordWrap}
          >
            <WrapText />
            <span>Word wrap</span>
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            className="min-h-11 shrink-0 gap-2"
            aria-label="Select all"
            action={() => onAction("select-all")}
          >
            <TextSelect />
            <span>Select all</span>
          </MobileActionButton>
          <MobileActionButton
            type="button"
            variant="ghost"
            className="min-h-11 shrink-0 gap-2"
            aria-label="Insert horizontal rule"
            action={() => onAction("horizontal-rule")}
          >
            <Rows3 />
            <span>Divider</span>
          </MobileActionButton>
        </div>
      )}
    </div>
  );
};

export default MobileEditorToolbar;

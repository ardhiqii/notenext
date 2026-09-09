import { Rows3, TextSelect, WrapText } from "lucide-react";
import { useRef, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MobileEditorAction } from "@/components/mobile-editor-toolbar";
import { cn } from "@/lib/utils";

type MobileEditorActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  onAction: (action: MobileEditorAction) => void;
  onFocusEditor: () => void;
};

type DialogPointerDownOutsideEvent = Parameters<
  NonNullable<ComponentProps<typeof DialogContent>["onPointerDownOutside"]>
>[0];

type SheetActionButtonProps = ComponentProps<typeof Button> & {
  action: () => void;
};

const SheetActionButton = ({ action, ...props }: SheetActionButtonProps) => {
  const handledPointerRef = useRef(false);

  return (
    <Button
      {...props}
      onPointerDown={(event) => {
        event.preventDefault();
        handledPointerRef.current = true;
        action();
      }}
      onPointerCancel={() => {
        handledPointerRef.current = false;
      }}
      onClick={() => {
        if (handledPointerRef.current) {
          handledPointerRef.current = false;
          return;
        }
        action();
      }}
    />
  );
};

const MobileEditorActionsSheet = ({
  open,
  onOpenChange,
  wordWrap,
  onToggleWordWrap,
  onAction,
  onFocusEditor,
}: MobileEditorActionsSheetProps) => {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      window.requestAnimationFrame(onFocusEditor);
    }
  };

  const runActionAfterClose = (action: () => void) => {
    handleOpenChange(false);
    window.requestAnimationFrame(() => {
      action();
      onFocusEditor();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id="mobile-editor-more-actions"
        showCloseButton
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event: DialogPointerDownOutsideEvent) => {
          const target = event.detail.originalEvent.target;
          if (
            target instanceof Element &&
            target.closest('[aria-label="More editor actions"]')
          ) {
            event.preventDefault();
          }
        }}
        className="bottom-0 left-0 top-auto max-h-[min(52dvh,28rem)] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-xl p-4 safe-area-bottom-content lg:hidden sm:max-w-none"
      >
        <DialogHeader className="pr-10 text-left">
          <DialogTitle>More editor actions</DialogTitle>
          <DialogDescription>
            Extra formatting actions for the note editor.
          </DialogDescription>
        </DialogHeader>
        <div
          className="grid gap-2 pb-1"
          aria-label="More editor actions"
        >
          <SheetActionButton
            type="button"
            variant="ghost"
            className={cn(
              "min-h-11 justify-start gap-3 px-3",
              wordWrap && "text-primary",
            )}
            aria-pressed={wordWrap}
            action={() => runActionAfterClose(onToggleWordWrap)}
          >
            <WrapText />
            <span>Word wrap</span>
          </SheetActionButton>
          <SheetActionButton
            type="button"
            variant="ghost"
            className="min-h-11 justify-start gap-3 px-3"
            aria-label="Select all"
            action={() => runActionAfterClose(() => onAction("select-all"))}
          >
            <TextSelect />
            <span>Select all</span>
          </SheetActionButton>
          <SheetActionButton
            type="button"
            variant="ghost"
            className="min-h-11 justify-start gap-3 px-3"
            aria-label="Insert horizontal rule"
            action={() => runActionAfterClose(() => onAction("horizontal-rule"))}
          >
            <Rows3 />
            <span>Divider</span>
          </SheetActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileEditorActionsSheet;

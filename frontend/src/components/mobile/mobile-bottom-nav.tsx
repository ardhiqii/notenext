import { Ellipsis, FilePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useNotes } from "@/hooks/use-notes";
import { useModal } from "@/hooks/use-modal";

const MobileBottomNav = () => {
  const surface = useMobileUi((state) => state.surface);
  const keyboardVisible = useMobileUi((state) => state.keyboardVisible);
  const openModal = useModal((state) => state.openModal);
  const { createNewNote, changeCurrentNote } = useNotes();

  if (keyboardVisible) return null;

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Note actions"
      className="mobile-bottom-nav safe-area-bottom z-20 grid shrink-0 grid-cols-3 border-t bg-background/95 px-2 backdrop-blur lg:hidden"
    >
      <Button
        type="button"
        variant="ghost"
        className="min-h-14 flex-col gap-0.5 rounded-none text-xs"
        onClick={() =>
          openModal("search-note", {
            callback: { changeCurrentNote },
          })
        }
      >
        <Search aria-hidden="true" />
        <span>Search</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="min-h-14 flex-col gap-0.5 rounded-none text-xs"
        onClick={() => createNewNote()}
      >
        <FilePlus aria-hidden="true" />
        <span>New note</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="min-h-14 flex-col gap-0.5 rounded-none text-xs"
        aria-label="Open menu"
        aria-controls="mobile-menu"
        aria-expanded={surface === "menu"}
        onClick={() => useMobileUi.getState().toggleSurface("menu")}
      >
        <Ellipsis aria-hidden="true" />
        <span>Menu</span>
      </Button>
    </nav>
  );
};

export default MobileBottomNav;

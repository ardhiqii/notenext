import {
  ArrowUpToLine,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
  WrapText,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { useOpenTabs } from "@/hooks/use-open-tabs";
import { useEditorSettings } from "@/hooks/use-editor-settings";
import { useModal } from "@/hooks/use-modal";
import { AuthMutations } from "@/queries/auth-mutations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MobileMenu = () => {
  const surface = useMobileUi((state) => state.surface);
  const closeSurface = useMobileUi((state) => state.closeSurface);
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const openModal = useModal((state) => state.openModal);
  const { wordWrap, toggleWordWrap } = useEditorSettings();
  const { currentNoteId } = useOpenTabs();
  const logoutMutation = AuthMutations.logout();
  const isOpen = surface === "menu";

  const goTo = (to: "/settings" | "/login") => {
    closeSurface();
    navigate({ to });
  };

  const openGlobalModal = (type: "changelog" | "export-note") => {
    closeSurface();
    if (type === "export-note") {
      openModal(type, { data: { noteId: currentNoteId } });
    } else {
      openModal(type);
    }
  };

  const logout = () => {
    closeSurface();
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate({ to: "/" }),
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSurface();
      }}
    >
      <DialogContent
        id="mobile-menu"
        showCloseButton={false}
        overlayClassName="!z-[40] lg:hidden"
        className="!z-[50] !top-auto !bottom-0 !translate-y-0 max-h-[min(72dvh,600px)] max-w-none gap-0 overflow-hidden rounded-b-none p-0 sm:!max-w-[min(92vw,560px)] lg:hidden"
      >
        <DialogHeader className="flex-row items-start justify-between border-b px-4 pb-3 pt-4 text-left">
          <div>
            <DialogTitle>Menu</DialogTitle>
            <DialogDescription>Account and note actions.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Close menu">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="safe-area-bottom-content min-h-0 overflow-y-auto overscroll-contain p-3 pt-2">
          <div className="grid gap-1">
            {user ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  onClick={() => goTo("/settings")}
                >
                  <Settings aria-hidden="true" />
                  Settings
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  aria-pressed={wordWrap}
                  onClick={toggleWordWrap}
                >
                  <WrapText aria-hidden="true" />
                  Word wrap
                  <span className="ml-auto text-xs text-muted-foreground">
                    {wordWrap ? "On" : "Off"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  onClick={() => openGlobalModal("export-note")}
                >
                  <ArrowUpToLine aria-hidden="true" />
                  Export
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  onClick={() => openGlobalModal("changelog")}
                >
                  <Sparkles aria-hidden="true" />
                  Changelog
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3 text-destructive hover:text-destructive"
                  disabled={logoutMutation.isPending}
                  onClick={logout}
                >
                  <LogOut aria-hidden="true" />
                  {logoutMutation.isPending ? "Signing out" : "Logout"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  onClick={() => goTo("/login")}
                >
                  <LogIn aria-hidden="true" />
                  Log in
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 px-3"
                  onClick={() => openGlobalModal("changelog")}
                >
                  <Sparkles aria-hidden="true" />
                  Changelog
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileMenu;

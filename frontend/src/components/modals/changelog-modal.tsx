import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useModal } from "@/hooks/use-modal";
import { CURRENT_CHANGELOG, APP_VERSION } from "@/lib/version";
import { AuthMutations } from "@/queries/auth-mutations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "notenext:changelog-seen";

const ChangelogModal = () => {
  const { type, closeModal } = useModal();
  const isOpen = type === "changelog";
  const user = useAuth((s) => s.user);
  const markSeenMutation = AuthMutations.markChangelogSeen();
  const [dismissed, setDismissed] = useState(false);

  // Mark the version as seen on dismiss — DB for logged-in users,
  // localStorage for guests.
  const handleGotIt = () => {
    if (user) {
      markSeenMutation.mutate(APP_VERSION, {
        onSuccess: () => closeModal(),
        onError: () => {
          // Non-fatal: don't block the user, but keep it dismissable.
          toast.error("Failed to save preference");
          closeModal();
        },
      });
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, APP_VERSION);
      } catch {
        /* private mode — ignore */
      }
      closeModal();
    }
  };

  // Escape / outside-click must also mark as seen (once per session).
  useEffect(() => {
    if (!isOpen || dismissed) return;
    setDismissed(true);
  }, [isOpen, dismissed]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleGotIt(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{CURRENT_CHANGELOG.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {CURRENT_CHANGELOG.version}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-1.5 font-medium text-foreground">What's new</p>
            <ul className="space-y-1 text-muted-foreground">
              {CURRENT_CHANGELOG.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-emerald-500">+</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 font-medium text-foreground">Bug fixes</p>
            <ul className="space-y-1 text-muted-foreground">
              {CURRENT_CHANGELOG.fixes.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-sky-500">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleGotIt}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangelogModal;

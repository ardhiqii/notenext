import { useModal } from "@/hooks/use-modal";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

const DeleteNoteModal = () => {
  const { isOpen, type, data, closeModal, callback } = useModal();
  const isModalOpen = isOpen && type === "delete-note";
  const deleteNoteHandler = () => {
    if (!callback.deleteNote || !data.note) {
      console.log("Delete Note failed at delete-note-modal");
      return;
    }
    callback.deleteNote(data.note.id);
    closeModal();
  };
  return (
    <Dialog open={isModalOpen} onOpenChange={closeModal}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            deleteNoteHandler();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {data?.note?.title}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-8">
            <DialogClose asChild>
              <Button type="button" variant={"outline"}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={"destructive"} autoFocus>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteNoteModal;

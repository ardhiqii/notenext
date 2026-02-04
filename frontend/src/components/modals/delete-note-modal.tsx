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
              Are you sure want to do this?{" "}
              <span className="font-semibold text-white">
                {data?.note?.title}
              </span>{" "}
              will be permently deleted
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-8">
            <DialogClose asChild>
              <Button type="button" variant={"outline"}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={"destructive"}>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteNoteModal;

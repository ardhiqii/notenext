import { useModal } from "@/hooks/use-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useState } from "react";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { useNotes } from "@/hooks/use-notes";

const ExportNoteModal = () => {
  const { isOpen, type, closeModal } = useModal();
  const [selectedId, setSelectedId] = useState<string[]>([]);
  const { tabs: notes } = useNotes();
  const isModalOpen = isOpen && type === "export-note";

  const onChangeChecked = (id: string) => {
    const exist = selectedId.includes(id);
    if (exist) {
      setSelectedId(selectedId.filter((selected) => selected !== id));
    } else {
      setSelectedId((prev) => [...prev, id]);
    }
  };

  const onOpenChange = () => {
    setSelectedId([]);
    closeModal();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Note</DialogTitle>
          <DialogDescription>
            Choose which note you want to export.
          </DialogDescription>
        </DialogHeader>
        {!notes && <>There is no notes.</>}
        <div className="max-h-[300px] overflow-y-auto flex flex-col">
          {notes &&
            notes.map((note) => (
              <div
                key={note.id}
                className="flex gap-x-2 space-y-2 "
              >
                <Checkbox
                  checked={selectedId.includes(note.id)}
                  onCheckedChange={() => onChangeChecked(note.id)}
                  id={note.id}
                  name={note.id}
                />
                <Label htmlFor={note.id} className="w-full">
                  {note.title}
                </Label>
              </div>
            ))}
        </div>
        <DialogFooter>
          <div className="space-x-2">
            <Button disabled={selectedId.length === 0} variant={"default"}>
              Export Selected
            </Button>
            <Button variant={"outline"}>Export Current Note</Button>
            <Button variant={"outline"}>Export All</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportNoteModal;

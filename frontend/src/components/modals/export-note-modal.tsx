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
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/queries";
import type { Note } from "@/types";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ExportNoteResponse {
  version: string;
  exportedAt: string;
  notes: { id: string; title: string; content: string; positionAt: number }[];
}

// Trigger a browser download of the JSON payload the backend produced
// (the API already sets Content-Disposition: attachment, but we read the
// body through the axios interceptor, so we recreate the file client-side).
const downloadJson = (payload: ExportNoteResponse, filename: string) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const ExportNoteModal = () => {
  const { isOpen, type, closeModal, data } = useModal();
  const [selectedId, setSelectedId] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();
  const notes = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
  const isModalOpen = isOpen && type === "export-note";
  const currentNoteId = data.noteId;

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

  const runExport = async (
    promise: Promise<{ data: ExportNoteResponse }>,
    filename: string,
  ) => {
    setExporting(true);
    try {
      const resp = await promise;
      downloadJson(resp.data, filename);
      onOpenChange();
    } catch {
      toast.error("Export gagal. Silakan coba lagi.");
    } finally {
      setExporting(false);
    }
  };

  const exportSelected = () => {
    if (selectedId.length === 0) return;
    void runExport(
      api.post("/notes/export", { noteIds: selectedId }),
      "notes-export-selected.json",
    );
  };

  const exportCurrentNote = () => {
    if (!currentNoteId) {
      toast.error("Tidak ada note yang sedang dibuka.");
      return;
    }
    void runExport(
      api.get(`/notes/${currentNoteId}/export`),
      "note-export.json",
    );
  };

  const exportAll = () => {
    void runExport(api.get("/notes/export"), "notes-export.json");
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
            <Button
              disabled={selectedId.length === 0 || exporting}
              variant={"default"}
              onClick={exportSelected}
            >
              Export Selected
            </Button>
            <Button
              variant={"outline"}
              disabled={exporting}
              onClick={exportCurrentNote}
            >
              Export Current Note
            </Button>
            <Button
              variant={"outline"}
              disabled={exporting}
              onClick={exportAll}
            >
              Export All
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportNoteModal;

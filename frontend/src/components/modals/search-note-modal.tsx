import { useModal } from "@/hooks/use-modal";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import type { Note } from "@/types";
import { NotebookText } from "lucide-react";

interface SearchNoteModalProps {
  notes: Note[];
  setActiveNote: (noteId: string) => void;
}

const SearchNoteModal = ({ notes, setActiveNote }: SearchNoteModalProps) => {
  const { isOpen, type, closeModal } = useModal();
  const isModalOpen = isOpen && type === "search-note";

  const handleSelectNote = (noteId: string) => {
    setActiveNote(noteId);
    closeModal();
  };

  return (
    <CommandDialog open={isModalOpen} onOpenChange={closeModal}>
      <CommandInput placeholder="Search notes by name or content" />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>

        {/* Search by note name */}
        <CommandGroup heading="Notes by Name">
          {notes &&
            notes.length > 0 &&
            notes.map((note) => (
              <CommandItem
                key={`name-${note.id}`}
                value={note.name}
                className="gap-2"
                onSelect={() => handleSelectNote(note.id)}
              >
                <NotebookText className="text-white flex-shrink-0" />
                <p className="truncate font-medium">{note.name}</p>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />

        {/* Search by note content */}
        <CommandGroup heading="Notes by Content">
          {notes &&
            notes.length > 0 &&
            notes.map((note) => (
              <CommandItem
                key={`content-${note.id}`}
                value={note.value}
                className="gap-2 flex-col items-start"
                onSelect={() => handleSelectNote(note.id)}
              >
                <div className="flex items-center gap-2 w-full">
                  <p className="truncate font-medium">{note.name}</p>
                </div>
                {note.value && (
                  <p className="text-sm text-muted-foreground truncate w-full">
                    {note.value.slice(0, 100)}
                  </p>
                )}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default SearchNoteModal;

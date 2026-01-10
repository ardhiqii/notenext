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
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/queries";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";

interface SearchNoteModalProps {
  setActiveNote: (noteId: string) => void;
}

const SearchNoteModal = ({ setActiveNote }: SearchNoteModalProps) => {
  const queryClient = useQueryClient();
  const { isOpen, type, closeModal } = useModal();
  const isModalOpen = isOpen && type === "search-note";

  const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
  const allNotes = useQueries({
    queries: !tabs
      ? []
      : tabs.map((tab) => ({
          queryKey: queryKeys.notes.noteById(tab.id),
          queryFn: async () => {
            const resp = await api.get(`/notes/${tab.id}`);
            return parseNote(resp.data);
          },
        })),
    combine: (results): Note[] => {
      return results
        .map((res) => res.data)
        .filter((note): note is Note => note !== undefined);
    },
  });

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
          {allNotes &&
            allNotes.length > 0 &&
            allNotes.map((note) => (
              <CommandItem
                key={`name-${note.id}`}
                value={note.title+note.id}
                className="gap-2"
                onSelect={() => handleSelectNote(note.id)}
              >
                <NotebookText className="text-white flex-shrink-0" />
                <p className="truncate font-medium">{note.title}</p>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />

        {/* Search by note content */}
        <CommandGroup heading="Notes by Content">
          {allNotes &&
            allNotes.length > 0 &&
            allNotes.map((note) => (
              <CommandItem
                key={`content-${note.id}`}
                value={note.content}
                className="gap-2 flex-col items-start"
                onSelect={() => handleSelectNote(note.id)}
              >
                <div className="flex items-center gap-2 w-full">
                  <p className="truncate font-medium">{note.title}</p>
                </div>
                {note.content && (
                  <p className="text-sm text-muted-foreground truncate w-full">
                    {note.content.slice(0, 100)}
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

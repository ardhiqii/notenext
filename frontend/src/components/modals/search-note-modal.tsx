import { useModal } from "@/hooks/use-modal";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { NoteQueryOptions } from "@/queries";
import { highlightText } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Folder, NotebookText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SearchNoteResult } from "@/types";

const SearchNoteModal = () => {
  const { isOpen, type, closeModal, callback } = useModal();
  const isModalOpen = isOpen && type === "search-note";
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce the input so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const q = debounced.trim();
  const qLower = q.toLowerCase();

  const { data, isLoading } = useQuery({
    ...NoteQueryOptions.searchNotes(q),
    enabled: isModalOpen && q.length > 0,
    placeholderData: keepPreviousData,
  });

  const results = useMemo<SearchNoteResult[]>(() => data ?? [], [data]);

  // Server returns both title and content matches; split them client-side and
  // dedupe so a note whose title matches never also appears under Content.
  const nameMatches = useMemo(
    () =>
      results.filter((note) => note.title.toLowerCase().includes(qLower)),
    [results, qLower],
  );

  const contentMatches = useMemo(
    () =>
      results.filter(
        (note) =>
          note.content_snippet.length > 0 &&
          !note.title.toLowerCase().includes(qLower),
      ),
    [results, qLower],
  );

  const handleSelectNote = (noteId: string) => {
    if (!callback.changeCurrentNote) {
      console.log("Change Current Note in search-note-modal not working");
      return;
    }
    callback.changeCurrentNote(noteId);
    closeModalHandler();
  };

  const closeModalHandler = () => {
    closeModal();
    setQuery("");
    setDebounced("");
  };

  const showHint = q.length === 0;
  const showLoading = isLoading;
  const showEmpty = !isLoading && q.length > 0 && results.length === 0;

  return (
    <CommandDialog
      open={isModalOpen}
      onOpenChange={closeModalHandler}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search notes by name or content"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {showHint && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Ketik untuk mencari…
          </div>
        )}

        {showLoading && (
          <CommandItem disabled value="searching">
            Searching…
          </CommandItem>
        )}

        {showEmpty && (
          <div className="py-6 text-center text-sm">No notes found.</div>
        )}

        {!showHint && !showLoading && nameMatches.length > 0 && (
          <>
            <CommandGroup heading="Notes by Name">
              {nameMatches.map((note) => (
                <CommandItem
                  key={`name-${note.id}`}
                  value={note.id}
                  className="gap-2"
                  onSelect={() => handleSelectNote(note.id)}
                >
                  <NotebookText className="shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium">
                      {highlightText(note.title, q)}
                    </p>
                    {note.content_snippet && (
                      <p className="truncate text-sm text-muted-foreground">
                        {highlightText(note.content_snippet, q)}
                      </p>
                    )}
                    {note.group_name && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Folder className="size-3" />
                        {note.group_name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {contentMatches.length > 0 && <CommandSeparator />}
          </>
        )}

        {!showHint && !showLoading && contentMatches.length > 0 && (
          <CommandGroup heading="Notes by Content">
            {contentMatches.map((note) => (
              <CommandItem
                key={`content-${note.id}`}
                value={note.id}
                className="flex-col items-start gap-2"
                onSelect={() => handleSelectNote(note.id)}
              >
                <div className="flex w-full items-center gap-2">
                  <NotebookText className="shrink-0" />
                  <p className="truncate font-medium">
                    {highlightText(note.title, q)}
                  </p>
                </div>
                {note.content_snippet && (
                  <p className="w-full truncate pl-6 text-sm text-muted-foreground">
                    {highlightText(note.content_snippet, q)}
                  </p>
                )}
                {note.group_name && (
                  <span className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
                    <Folder className="size-3" />
                    {note.group_name}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default SearchNoteModal;

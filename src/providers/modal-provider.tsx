import SearchNoteModal from "@/components/modals/search-note-modal";
import type { Note } from "@/types";
import { useEffect, useState } from "react";

interface ModalProviderProps {
  notes: Note[];
  setActiveNote: (noteId: string) => void;
}

const ModalProvider = ({ notes, setActiveNote }: ModalProviderProps) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <>
      <SearchNoteModal notes={notes} setActiveNote={setActiveNote} />
    </>
  );
};

export default ModalProvider;

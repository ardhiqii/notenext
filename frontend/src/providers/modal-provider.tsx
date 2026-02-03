import ConnectionNoteModal from "@/components/modals/connection-note-modal";
import SearchNoteModal from "@/components/modals/search-note-modal";
import { useEffect, useState } from "react";

interface ModalProviderProps {
  setActiveNote: (noteId: string) => void;
}

const ModalProvider = ({ setActiveNote }: ModalProviderProps) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <>
      <SearchNoteModal setActiveNote={setActiveNote} />
      <ConnectionNoteModal/>
    </>
  );
};

export default ModalProvider;

import ChangelogModal from "@/components/modals/changelog-modal";
import ConnectionNoteModal from "@/components/modals/connection-note-modal";
import DeleteNoteModal from "@/components/modals/delete-note-modal";
import ExportNoteModal from "@/components/modals/export-note-modal";
import SearchNoteModal from "@/components/modals/search-note-modal";
import { useEffect, useState } from "react";

const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <>
      <SearchNoteModal />
      <ConnectionNoteModal />
      <DeleteNoteModal />
      <ExportNoteModal/>
      <ChangelogModal />
    </>
  );
};

export default ModalProvider;

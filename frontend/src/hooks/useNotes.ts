import { useState, useEffect, useRef } from "react";
import {
  useCreateNoteMutation,
  useNoteDetailQuery,
  useTabsQuery,
} from "@/queries";

export const useNotes = () => {
  const { data: tabs, isSuccess } = useTabsQuery();
  const [currentNoteId, setCurrentNoteId] = useState<string>();
  const { data: currentNote } = useNoteDetailQuery(currentNoteId);
  const createNoteMutation = useCreateNoteMutation();
  const pendingCountRef = useRef(0)

  useEffect(() => {
    if (isSuccess && tabs.length > 0 && !currentNoteId) {
      setCurrentNoteId(tabs[0].id);
    }
  }, [isSuccess, tabs?.length, currentNoteId]);

  const createNewNote = () => {
    if(createNoteMutation.isPending || pendingCountRef.current > 3){
      console.log("BEEP");
      return
    }
    pendingCountRef.current++;
    createNoteMutation.mutate(undefined, {
      onSuccess: (newNote) => {
        setCurrentNoteId(newNote.id);
      },
      onSettled: () =>{
        pendingCountRef.current--;
      }
    });
  };

  const closeNote = () => {};

  const renameNote = () => {};

  return {
    tabs,
    currentNote,
    createNewNote,
    currentNoteId,
    setCurrentNoteId,
    closeNote,
    renameNote,
  };
};

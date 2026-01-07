import { useState, useRef, useEffect } from "react";
import type { Note } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export const useNotes = () => {
  const queryClient = useQueryClient();
  const noteCounterRef = useRef(1);

  // Query All Tabs for TabsBar
  const { data: tabs = [], isSuccess } = useQuery({
    queryKey: queryKeys.notes.tabs,
    queryFn: async () => {
      const resp = await api.get<Note[]>("/notes?only_tabs=true");
      return resp.data;
    },
  });

  // Track current note
  const [currentNoteId, setCurrentNoteId] = useState<string>();
  // Temporary note id for pending in creating note
  const [pendingNoteId, setPendingNoteId] = useState<string | null>()

  // Query Get note
  const { data: currentNote } = useQuery({
    queryKey: queryKeys.notes.noteById(currentNoteId!),
    queryFn: async () => {
      if (!currentNoteId) return null;
      const resp = await api.get(`/notes/${currentNoteId}`);
      return resp.data;
    },
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post<Note>("/notes");
      return resp.data;
    },
    onMutate: async () =>{
      const tempId = `pending-${Date.now()}`
      setPendingNoteId(tempId)
      setCurrentNoteId(tempId)
      return {tempId}
    },
    onSuccess: (newNote) => {
      setPendingNoteId(null)
      setCurrentNoteId(newNote.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.tabs });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({});

  useEffect(() => {
    if (isSuccess && tabs.length && tabs.length > 0) {
      setCurrentNoteId(currentNoteId ?? tabs[0].id);
    }
  }, [isSuccess, tabs?.length, currentNoteId]);

  const addNote = () => {
    noteCounterRef.current += 1;
    createNoteMutation.mutate();
  };

  const closeNote = (noteId: string) => {
    // setNotes((prevNotes) => {
    //   // Find the index of the note being closed
    //   const closingIndex = prevNotes.findIndex((note) => note.id === noteId);
    //   const filtered = prevNotes.filter((note) => note.id !== noteId);

    //   // If we're closing the active note, set a new active note
    //   if (noteId === activeNote && filtered.length > 0) {
    //     // If the closing note is the last one, activate the previous note
    //     if (closingIndex === prevNotes.length - 1) {
    //       setActiveNote(filtered[filtered.length - 1].id);
    //     } else {
    //       // Otherwise, activate the next note (which is now at the same index)
    //       setActiveNote(filtered[closingIndex].id);
    //     }
    //   }
    //   return filtered;
    // });
    console.log(noteId);
  };

  const renameNote = (noteId: string, newName: string) => {
    setNotes((prevNotes) =>
      prevNotes.map((note) =>
        note.id === noteId ? { ...note, name: newName } : note
      )
    );
  };

  return {
    tabs,
    currentNoteId,
    setCurrentNoteId,
    addNote,
    closeNote,
    renameNote,
    currentNote,
  };
};

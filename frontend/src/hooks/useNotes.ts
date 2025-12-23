import { useState, useRef, useEffect } from "react";
import type { Note } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useNotes = () => {
  const queryClient = useQueryClient();

  const { data: notes, isSuccess } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      
      const resp = await api.get<Note[]>("/notes");
      console.log({
        message:'FETCHED',
        content:resp.data[0].content
      });
      return resp.data;
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post<Note>("/notes");
      return resp.data;
    },
    onSuccess: (newNote) => {
      setActiveNote(newNote.id);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const [activeNote, setActiveNote] = useState<string>();
  const noteCounterRef = useRef(1);

  useEffect(() => {
    if (isSuccess && notes.length && notes.length > 0) {
      setActiveNote(activeNote ?? notes[0].id);
    }
  }, [isSuccess, notes?.length, activeNote]);

  useEffect(() => {
    if (isSuccess && notes && notes.length === 0) {
      addNote();
    }
  }, [isSuccess, notes]);

  const addNote = () => {
    noteCounterRef.current += 1;
    createNoteMutation.mutate();
  };

  const closeNote = (noteId: string) => {
    setNotes((prevNotes) => {
      // Find the index of the note being closed
      const closingIndex = prevNotes.findIndex((note) => note.id === noteId);
      const filtered = prevNotes.filter((note) => note.id !== noteId);

      // If we're closing the active note, set a new active note
      if (noteId === activeNote && filtered.length > 0) {
        // If the closing note is the last one, activate the previous note
        if (closingIndex === prevNotes.length - 1) {
          setActiveNote(filtered[filtered.length - 1].id);
        } else {
          // Otherwise, activate the next note (which is now at the same index)
          setActiveNote(filtered[closingIndex].id);
        }
      }

      return filtered;
    });
  };

  const renameNote = (noteId: string, newName: string) => {
    setNotes((prevNotes) =>
      prevNotes.map((note) =>
        note.id === noteId ? { ...note, name: newName } : note
      )
    );
  };

  const getCurrentNote = () => {
    return notes?.find((note) => note.id === activeNote) || notes?.[0];
  };

  const currentNote = getCurrentNote();

  return {
    notes,
    activeNote,
    setActiveNote,
    addNote,
    closeNote,
    renameNote,
    getCurrentNote,
    currentNote,
  };
};

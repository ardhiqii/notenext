import { useState, useRef } from "react";
import type { Note } from "@/types";

const defaultNotes: Note[] = [
  {
    id: crypto.randomUUID() as string,
    name: "new 1",
    counter: 1,
    value: "",
  },
];

export const useNotes = () => {
  const [activeNote, setActiveNote] = useState<string>(defaultNotes[0].id);
  const [notes, setNotes] = useState<Note[]>(defaultNotes);
  const noteCounterRef = useRef(1);

  const changeNoteValue = (value: string) => {
    setNotes((prevNotes) =>
      prevNotes.map((note) =>
        note.id === activeNote ? { ...note, value } : note
      )
    );
  };

  const addNote = () => {
    noteCounterRef.current += 1;
    const note = {
      id: crypto.randomUUID() as string,
      name: `new ${noteCounterRef.current}`,
      value: "",
      counter: noteCounterRef.current,
    };
    setNotes((prevNotes) => [...prevNotes, note]);
    setActiveNote(note.id);
  };

  const closeNote = (noteId: string) => {
    setNotes((prevNotes) => {
      const filtered = prevNotes.filter((note) => note.id !== noteId);

      if (noteId === activeNote && filtered.length > 0) {
        setActiveNote(filtered[filtered.length - 1].id);
      }

      return filtered;
    });
  };

  const getCurrentNote = () => {
    return notes.find((note) => note.id === activeNote) || notes[0];
  };

  return {
    notes,
    activeNote,
    setActiveNote,
    changeNoteValue,
    addNote,
    closeNote,
    getCurrentNote,
    setNotes,
  };
};

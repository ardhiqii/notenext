import { cn } from "@/lib/utils";
import type { Note } from "@/types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TabProps {
  note: Note;
  activeNote: string;
  setActiveNote: (noteId: string) => void;
  closeNote: (noteId: string) => void;
  renameNote: (noteId: string, newName: string) => void;
}

const Tab = ({
  note,
  activeNote,
  closeNote,
  setActiveNote,
  renameNote,
}: TabProps) => {
  const activeTabRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(note.name);
  const [inputWidth, setInputWidth] = useState(0);

  const { attributes, listeners, transform, transition, setNodeRef } =
    useSortable({ id: note.counter });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const mergedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    activeTabRef.current = node;
  };

  useEffect(() => {
    if (activeTabRef.current && note.id === activeNote) {
      requestAnimationFrame(() => {
        activeTabRef.current?.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "center",
        });
      });
    }
  }, [activeNote, note.id]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (measureRef.current) {
      const width = measureRef.current.offsetWidth;
      setInputWidth(Math.max(width + 16, 40)); // Add padding and set minimum width
    }
  }, [editedName]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditedName(note.name);
  };

  const handleBlur = () => {
    if (editedName.trim()) {
      renameNote(note.id, editedName.trim());
    } else {
      setEditedName(note.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditedName(note.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        "pl-3 pr-1 py-1 border-r cursor-pointer group hover:bg-zinc-900 flex text-nowrap items-center border-t-2 relative",
        note.id === activeNote && "border-t-orange-600 border-t-2  bg-zinc-900 "
      )}
      onClick={() => setActiveNote(note.id)}
      onDoubleClick={handleDoubleClick}
    >
      {/* Hidden span for measuring text width */}
      <span
        ref={measureRef}
        className="text-sm font-thin absolute invisible whitespace-pre pointer-events-none"
        aria-hidden="true"
      >
        {editedName || " "}
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{ width: `${inputWidth}px` }}
          className="text-sm font-thin mr-2 bg-zinc-800 border  rounded px-1 outline-none"
        />
      ) : (
        <p className="text-sm font-thin mr-2">{note.name}</p>
      )}
      <div
        className={cn(
          "h-full group-hover:opacity-100 opacity-0 flex items-center",
          note.id === activeNote && "opacity-100"
        )}
        onClick={(e) => {
          e.stopPropagation();
          closeNote(note.id);
        }}
      >
        <X className={"w-3 h-3 mt-0.5 "} />
      </div>
    </div>
  );
};

export default Tab;

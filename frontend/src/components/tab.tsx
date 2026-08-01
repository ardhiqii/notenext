import { cn } from "@/lib/utils";
import type { Note } from "@/types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useModal } from "@/hooks/use-modal";
import { useMatchRoute } from "@tanstack/react-router";
import { useNotes } from "@/hooks/use-notes";

interface TabProps {
  tab: Note;
  onContextMenu?: (tab: Note, e: React.MouseEvent) => void;
}

const Tab = ({ tab, onContextMenu }: TabProps) => {
  const { openModal } = useModal();
  const { closeNote, renameTitleNote, changeCurrentNote } = useNotes();
  const matchRoute = useMatchRoute();
  const noteMatch = matchRoute({ to: "/n/$noteId" });
  const currentNoteId = noteMatch ? (noteMatch as { noteId: string }).noteId : undefined;

  const activeTabRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(tab.title);
  const [inputWidth, setInputWidth] = useState(0);

  const { attributes, listeners, transform, transition, setNodeRef } =
    useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const mergedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    activeTabRef.current = node;
  };

  // Sync editedName with tab.title when it changes (after successful rename)
  useEffect(() => {
    if (!isEditing) {
      setEditedName(tab.title);
    }
  }, [tab.title, isEditing]);

  // Animation dnd
  useEffect(() => {
    if (activeTabRef.current && tab.id === currentNoteId) {
      requestAnimationFrame(() => {
        activeTabRef.current?.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "center",
        });
      });
    }
  }, [currentNoteId, tab.id]);

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
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmedName = editedName.trim();

    // Only call renameNote if the name actually changed and is not empty
    if (trimmedName && trimmedName !== tab.title) {
      renameTitleNote(tab.id, trimmedName);
    } else if (!trimmedName) {
      // If empty, revert to original title
      setEditedName(tab.title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditedName(tab.title);
      setIsEditing(false);
    }
  };

  const closeNoteHandler = () => {
    openModal("delete-note", {
      data: {
        note: tab,
      },
      callback: {
        deleteNote: closeNote,
      },
    });
  };

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        "pl-3 pr-1 py-1 border-r cursor-pointer group hover:bg-card flex text-nowrap items-center border-t-2 relative h-10",
        tab.id === currentNoteId && "border-t-orange-600 border-t-2  bg-card ",
      )}
      onClick={() => changeCurrentNote(tab.id)}
      onContextMenu={(e) => onContextMenu?.(tab, e)}
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
          className="text-sm font-thin mr-2 bg-background border  rounded px-1 outline-none"
        />
      ) : (
        <p className="text-sm font-thin mr-2">{tab.title}</p>
      )}
      <div
        className={cn(
          "h-full group-hover:opacity-100 opacity-0 flex items-center",
          tab.id === currentNoteId && "opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          closeNoteHandler();
        }}
      >
        {/* <SyncIndicator /> */}
        <X className={"w-3 h-3"} />
      </div>
    </div>
  );
};

export default Tab;

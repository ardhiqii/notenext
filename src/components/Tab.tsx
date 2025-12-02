import { cn } from "@/lib/utils";
import type { Note } from "@/types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface TabProps {
  note: Note;
  activeNote: string;
  setActiveNote: (noteId: string) => void;
  closeNote: (noteId: string) => void;
}

const Tab = ({ note, activeNote, closeNote, setActiveNote }: TabProps) => {
  const activeTabRef = useRef<HTMLDivElement>(null);
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
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "end",
      });
    }
  }, [activeNote, note.id]);

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        "pl-3 pr-1 py-1 border-r cursor-pointer group hover:bg-zinc-900 flex text-nowrap items-center border-t-2 ",
        note.id === activeNote && "border-t-orange-600 border-t-2  bg-zinc-900 "
      )}
      onClick={() => setActiveNote(note.id)}
    >
      <p className="text-sm font-thin mr-2">{note.name}</p>
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

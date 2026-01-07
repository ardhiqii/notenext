import type { Note } from "@/types";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Ellipsis,
  FilePlusCorner,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import Tab from "./Tab";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

interface TabsBarProps {
  tabs: Note[];
  currentNoteId: string;
  setCurrentNoteId: (noteId: string) => void;
  addNote: () => void;
  closeNote: (noteId: string) => void;
  renameNote: (noteId: string, newName: string) => void;
  setNotes: any;
}

const TabsBar = ({
  tabs,
  currentNoteId,
  setCurrentNoteId,
  addNote,
  closeNote,
  renameNote,
  setNotes,
}: TabsBarProps) => {

  // const updatePostionTab = useMutation({
  //   mutationFn: async ({id,positionAt}:{id:string, positionAt:number})=>{

  //   }
  // })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setNotes((items) => {
        const oldIndex = items.findIndex(
          (item) => item.positionAt === active.id
        );
        const newIndex = items.findIndex((item) => item.positionAt === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddNote = () => {
    addNote();
  };
  
  return (
    <div className="w-full flex">
      <div className="flex-1 h-11 border-b-2 border-t-2 flex overflow-x-auto -mt-0.5 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        >
          <SortableContext
            items={tabs.map((tab) => tab.positionAt)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                tab={tab}
                setCurrentNoteId={setCurrentNoteId}
                currentNoteId={currentNoteId}
                closeNote={closeNote}
                renameNote={renameNote}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="flex space-x-1 flex-row-reverse border-b-2 border-t-2 -mt-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="h-full flex items-center px-2 cursor-pointer hover:bg-zinc-900">
              <Ellipsis strokeWidth={1} className="w-5"  />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <ArrowDownToLine className="w-4 mr-2" />
              Import
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ArrowUpToLine className="w-4 mr-2" />
              Export
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="h-full flex items-center px-2 cursor-pointer hover:bg-zinc-900"
          onClick={handleAddNote}
        >
          <FilePlusCorner className="w-5" strokeWidth={1} />
        </div>
      </div>
    </div>
  );
};

export default TabsBar;

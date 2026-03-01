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
import { useQuery } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useParams } from "@tanstack/react-router";
import { NoteQueryOptions } from "@/hooks/note-query-options";
import { useNotes } from "@/hooks/use-notes";
import Tab from "./tab";
import { cn } from "@/lib/utils";

const TabsBar = () => {
  const { openModal } = useModal();
  const { createNewNote } = useNotes();
  const { data: notes, isSuccess } = useQuery(
    NoteQueryOptions.getAllNoteOnlyTitle,
  );
  const { noteId: currentNoteId } = useParams({ from: "/n/$noteId" });

  // const updatePostionTab = useMutation({
  //   mutationFn: async ({id,positionAt}:{id:string, positionAt:number})=>{

  //   }
  // })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    // const { active, over } = event;
    // if (over && active.id !== over.id) {
    //   queryClient.setQueryData(queryKeys.notes.tabs, (old: Note[]) => {
    //     const oldIndex = old.findIndex((item) => item.id === active.id);
    //     const newIndex = old.findIndex((item) => item.id === over.id);
    //     const newArray = arrayMove(old, oldIndex, newIndex);
    //     return newArray;
    //   });
    // }
  };

  const handleAddNote = () => {
    createNewNote();
  };

  return (
    <div className="w-full flex bg-background">
      <div
        className={cn(
          "flex-1 flex overflow-x-auto",
          // Scrollbar Styling
          "[&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent  [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full ",
        )}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        >
          {isSuccess && (
            <SortableContext
              items={notes.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {notes.map((tab) => (
                <Tab key={tab.id} tab={tab} />
              ))}
            </SortableContext>
          )}
        </DndContext>
      </div>
      <div className="flex space-x-1 flex-row-reverse ">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="h-full flex items-center px-2 cursor-pointer hover:bg-card">
              <Ellipsis strokeWidth={1} className="w-5" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <ArrowDownToLine className="w-4 mr-2" />
              Import
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                openModal("export-note", {
                  data: {
                    noteId: currentNoteId,
                  },
                })
              }
            >
              <ArrowUpToLine className="w-4 mr-2" />
              Export
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="h-full flex items-center px-2 cursor-pointer hover:bg-card"
          onClick={handleAddNote}
        >
          <FilePlusCorner className="w-5" strokeWidth={1} />
        </div>
      </div>
    </div>
  );
};

export default TabsBar;

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  // arrayMove,
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
  CircleUserRound,
  Ellipsis,
  FilePlusCorner,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useModal } from "@/hooks/use-modal";
import { useNavigate, useParams } from "@tanstack/react-router";
import { NoteQueryOptions } from "@/queries/note-query-options";
import { useNotes } from "@/hooks/use-notes";
import Tab from "./tab";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import React from "react";
import { Button } from "./ui/button";
import { AuthMutations } from "@/queries/auth-mutations";

const TabsBar = () => {
  const user = useAuth((state) => state.user);
  const openModal = useModal((state) => state.openModal);
  const { createNewNote } = useNotes();
  const logoutMutate = AuthMutations.logout();
  const navigate = useNavigate();

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

  const handleDragEnd = (_: DragEndEvent) => {
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
      <div className="flex space-x-1 flex-row-reverse">
        {user ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="h-full flex items-center px-2 cursor-pointer hover:bg-card">
                  <Ellipsis strokeWidth={1} className="w-5" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {user && (
                  <DropdownMenuItem
                    onClick={() => {
                      logoutMutate.mutate(undefined, {
                        onSuccess: () => {
                          navigate({
                            to: "/",
                          });
                        },
                      });
                    }}
                  >
                    <LogOut className="w-4 mr-1.5 ml-0.5" />
                    Logout
                  </DropdownMenuItem>
                )}
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
          </>
        ) : (
          <Button
            variant={"ghost"}
            className="h-full cursor-pointer dark:hover:bg-primary/10 rounded-none"
            onClick={() => {
              window.location.href = `${import.meta.env.VITE_ROOT_API}/auth/google`;
            }}
          >
            <span>Log in</span>
            <CircleUserRound className="mt-0.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default React.memo(TabsBar);

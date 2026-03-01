import { queryKeys } from "@/queries";
import { useQueryClient } from "@tanstack/react-query";
import { type Note } from "@/types";
import { NoteMutations } from "./note-mutations";
import { useNavigate } from "@tanstack/react-router";

export const useNotes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = NoteMutations.create();
  const deleteMutation = NoteMutations.deleteNote();
  const renameMutation = NoteMutations.renameTitle();
  const updateMutation = NoteMutations.update();
  // const [currentNoteId, setCurrentNoteId] = useState<string>("");

  // const { data: tabs = [], isSuccess } = useQuery<Note[]>({
  //   queryKey: queryKeys.notes.tabs,
  //   queryFn: async () => {
  //     const resp = await api.get("/notes?only_tabs=true");
  //     return resp.data.map(parseNote);
  //   },
  // });

  // const { data: currentNote = null } = useQuery<Note | null>({
  //   queryKey: queryKeys.notes.noteById(currentNoteId ?? ""),
  //   queryFn: async () => {
  //     if (!currentNoteId) return null;
  //     const resp = await api.get(`/notes/${currentNoteId}`);
  //     return parseNote(resp.data);
  //   },
  // });

  // Only fetch current note + prefetch adjacent tabs
  // const currentIndex = tabs.findIndex((t) => t.id === currentNoteId);
  // const adjacentTabs = [tabs[currentIndex - 1], tabs[currentIndex + 1]].filter(
  //   Boolean,
  // );

  // useQueries({
  //   queries: adjacentTabs.map((tab) => ({
  //     queryKey: queryKeys.notes.noteById(tab.id),
  //     queryFn: async () => {
  //       const resp = await api.get(`/notes/${tab.id}`); // Fix: use tab.id not currentNoteId
  //       return parseNote(resp.data);
  //     },
  //     staleTime: 5 * 60 * 1000,
  //   })),
  // });

  const createNewNote = async () => {
    if (createMutation.isPending) {
      console.log("PENDING");
      return;
    }
    const note = await createMutation.mutateAsync();
    changeCurrentNote(note.id);
  };

  const closeNote = (id: string) => {
    const notes = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
    if (!notes || notes.length <= 1) return;
    deleteMutation.mutate({
      id,
      onMutateFn: () => {
        const currentIdx = notes.findIndex((tab) => tab.id == id);
        const nextIdx =
          currentIdx === notes.length - 1 ? currentIdx - 1 : currentIdx + 1;
        changeCurrentNote(notes[nextIdx].id);
      },
    });
  };

  const updateContentNote = (updateNote: Note) => {
    updateMutation.mutate(updateNote);
  };

  const renameTitleNote = (id: string, title: string) => {
    renameMutation.mutate({ id, title });
  };

  const changeCurrentNote = (id: string) => {
    navigate({
      to: "/n/$noteId",
      params: { noteId: id },
    });
  };

  return {
    createNewNote,
    closeNote,
    renameTitleNote,
    updateContentNote,
    changeCurrentNote,
  };
};

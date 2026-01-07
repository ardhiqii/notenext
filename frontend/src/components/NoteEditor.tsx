import { api } from "@/lib/api";
import type { Note } from "@/types";
import { Editor } from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";

interface NoteEditorProps {
  currentNote: Note;
}

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const updateNoteContentMutation = useMutation({
    mutationFn: async ({ noteId,content }: {noteId:string, content: string }) => {
      console.log("MUTATION");
      await api.patch(`/notes/${noteId}/content`, {
        content,
      });
    },
    onMutate: async (newNote, ctx) => {
      await ctx.client.cancelQueries({queryKey:['notes']})

      ctx.client.setQueryData(['notes'], (old: Note[] | undefined)=>{
        if(!old) return old;
        return old.map((n)=> n.id === newNote.noteId ? {...n,content:newNote.content} : n)
      })

    },
  });

  const [noteContent, setNoteContent] = useState(currentNote.content ?? "");
  const [debouncedContent] = useDebounce(noteContent, 500);
  const previousNoteIdRef = useRef(currentNote.id);

  useEffect(() => {
    const previousNoteId = previousNoteIdRef.current;
    if (previousNoteId !== currentNote.id) {
      if (noteContent !== currentNote.content) {
        // console.log("TRIGGERED WHEN CHANGES TAB", currentNote.title);
        updateNoteContentMutation.mutate({noteId:previousNoteId, content: noteContent });
      }
    }
    setNoteContent(currentNote.content ?? "");
    previousNoteIdRef.current = currentNote.id;
  }, [currentNote.id]);


  useEffect(() => {
    if (debouncedContent != currentNote.content) {
      // console.log("BOUNCY BOUNCY",currentNote.title);
      updateNoteContentMutation.mutate({noteId:previousNoteIdRef.current, content: debouncedContent });
    }
  }, [debouncedContent]);

  const updateNoteContentHandler = async (content: string) => {
    setNoteContent(content);
  };

  return (
    <div className=" bg-zinc-900  h-full">
      <Editor
        value={noteContent}
        onChange={(value) => updateNoteContentHandler(value || "")}
        theme="vs-dark"
        height={"100%"}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          wordWrap: "on",
          padding: { top: 8 },
          smoothScrolling: true,
          lineNumbersMinChars: 2,
        }}
      />
    </div>
  );
};

export default NoteEditor;

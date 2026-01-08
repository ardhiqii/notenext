import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { api } from "@/lib/api";
import { parseNote, type Note } from "@/types";
import { useRef } from "react";
import {v4 as uuid} from "uuid"


export const useTabsQuery = () => {
  return useQuery<Note[]>({
    queryKey: queryKeys.notes.tabs,
    queryFn: async () => {
      const resp = await api.get("/notes?only_tabs=true");
      return resp.data.map(parseNote)
    },
  });
};

export const useNoteDetailQuery = (noteId:string | undefined) =>{
  return useQuery<Note | null>({
    queryKey:queryKeys.notes.noteById(noteId ?? ""),
    queryFn: async () =>{
      if(!noteId) return null
      const resp = await api.get(`/notes/${noteId}`)
      return parseNote(resp.data)
    },
    enabled: !!noteId
  })
} 

type CreateNoteContext = {
  prevTabs: Note[] | undefined
  optimisticNote: Note
}

export const useCreateNoteMutation = () =>{
  return useMutation<Note,Error,void,CreateNoteContext>({
    mutationFn: async () =>{
      const resp = await api.post("/notes")
      return parseNote(resp.data)
    },
    onMutate: async (_newNote,ctx) =>{
      await ctx.client.cancelQueries({queryKey:queryKeys.notes.tabs})
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs)
      
      const optimisticNote: Note = {
        id:`temp-${uuid()}`,
        title:`new ${prevTabs ? prevTabs.length + 1 : "note"}`,
        content:"",
        positionAt: Date.now() + 1
      }
      ctx.client.setQueryData(queryKeys.notes.tabs, (old:Note[])=>[...old,optimisticNote])
      return {prevTabs,optimisticNote}
    },
    onSuccess: (result,_vars,onMutateResult,ctx) =>{
      ctx.client.setQueryData(queryKeys.notes.tabs, (old:Note[])=>old.map((tab)=>
        tab.id === onMutateResult.optimisticNote.id ? result : tab
      ))
    },
    onError: (_error,_variables,onMutateResult,ctx)=>{
      console.log("ERROR",onMutateResult?.optimisticNote.id);
      if(!onMutateResult?.optimisticNote) return
      const errorNote: Note = {
        ...onMutateResult?.optimisticNote,
        title: "[Error create note]"
      }
      ctx.client.setQueryData(queryKeys.notes.tabs, (old:Note[]) => old.map((tab)=>tab.id === onMutateResult.optimisticNote.id ? errorNote : old))
    },
  })
}
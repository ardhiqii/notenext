import { localStorageKeys } from "@/constants"

export const getStoreNoteId = (): string | null =>{
  if(typeof window === 'undefined') return null
  return localStorage.getItem(localStorageKeys.currentNoteId)
}

export const setStoreNoteId = (noteId:string | null) =>{
  if(typeof window === 'undefined') return
  if(noteId){
    localStorage.setItem(localStorageKeys.currentNoteId, noteId)
  }else{
    localStorage.removeItem(localStorageKeys.currentNoteId)
  }
}


import type { Note } from "@/types"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


type noteApi = {
  id: string;
  title: string;
  content: string;
  position_at: number;
};
export function parseNote(data: noteApi): Note {
  return {
    id: data.id,
    content: data.content,
    title: data.title,
    positionAt: data.position_at,
  };
}
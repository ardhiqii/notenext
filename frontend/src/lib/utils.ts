import type { Note } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export const getWebSocketBaseUrl = () => {
  const rootApi = import.meta.env.VITE_ROOT_API;

  if (rootApi.startsWith("http://")) {
    return rootApi.replace("http://", "ws://") + "/notes";
  }
  if (rootApi.startsWith("https://")) {
    return rootApi.replace("https://", "wss://") + "/notes";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;

  return `${protocol}//${host}${rootApi}/notes`;
};

import type { Note, TabGroupWithTabs } from "@/types";
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
  group_id?: string | null;
};
export function parseNote(data: noteApi): Note {
  return {
    id: data.id,
    content: data.content,
    title: data.title,
    positionAt: data.position_at,
    groupId: data.group_id,
  };
}

type tabGroupApi = {
  id: string;
  name: string;
  position_at: number;
  collapsed: boolean;
  tabs: noteApi[];
};

export function parseTabGroup(data: tabGroupApi): TabGroupWithTabs {
  return {
    id: data.id,
    name: data.name,
    positionAt: data.position_at,
    collapsed: data.collapsed,
    tabs: (data.tabs || []).map(parseNote),
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

// function escapeRegExp(s: string) {
//   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// }

// export function highlightText(text: string, query: string) {
//   if (!query) return text;
//   if (query.length < 3) return;
//   const regex = new RegExp(`(${escapeRegExp(query)})`, "ig");
//   const parts = text.split(regex);
//   const test = parts.map((part, i) =>
//   part.toLowerCase() === query.toLowerCase() ? part : part
//   )

// }

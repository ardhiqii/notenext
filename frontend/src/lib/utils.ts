import type { Note, TabGroupWithTabs } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import React from "react";

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight every case-insensitive occurrence of `query` inside `text`
 * by wrapping the matches in <mark>. Returns plain text when there is
 * nothing to highlight.
 */
export function highlightText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;

  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, "ig");
  const parts = text.split(regex);

  return parts.map((part, i) =>
    part.toLowerCase() === trimmed.toLowerCase()
      ? React.createElement(
          "mark",
          {
            key: i,
            className:
              "rounded-sm bg-yellow-400 px-0.5 text-black",
          },
          part,
        )
      : part,
  );
}

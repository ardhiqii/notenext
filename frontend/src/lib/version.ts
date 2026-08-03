export const APP_VERSION = "1.0.0";

export interface ChangelogEntry {
  version: string;
  title: string;
  features: string[];
  fixes: string[];
}

// Draft content — user to confirm wording before finalizing.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.0",
    title: "NoteNext 1.0",
    features: [
      "Tab groups — organize notes with drag & drop",
      "Real-time collaboration via WebSocket",
      "Ctrl+K quick search",
      "Google sign-in",
      "Public notes for everyone",
    ],
    fixes: [
      "Tab title now always matches the sidebar",
      "Editor no longer shows a blank page on rapid tab switching",
      "Reconnect works after the connection drops",
      "Hardened note ownership and auth",
    ],
  },
];

export const CURRENT_CHANGELOG = CHANGELOG[0];

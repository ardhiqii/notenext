export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["notes","tabs"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
  },
  publicNotes: {
    all: ["public-notes"],
    tabs: ["public-notes","public-tabs"],
    noteById: (id: string) => [...queryKeys.publicNotes.all, id],
  },
  auth: {
    me: ["auth", "me"],
  },
};

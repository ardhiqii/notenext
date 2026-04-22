export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["notes", "tabs"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
  },
  auth: {
    me: ["auth", "me"],
    ws: ["auth", "ws"]
  },
};

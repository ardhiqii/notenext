export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["notes", "tabs"],
    public: ["notes", "public"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
  },
  auth: {
    me: ["auth", "me"],
    ws: ["auth", "ws"],
  },
  tabGroups: {
    all: ["tab-groups"],
    withTabs: ["tab-groups", "tabs"],
  },
};

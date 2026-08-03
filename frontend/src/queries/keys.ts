export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["notes", "tabs"],
    public: ["notes", "public"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
    search: (q: string) => [...queryKeys.notes.all, "search", q],
    // Prefix key covering every search query (["notes","search",q]) so a
    // mutation can invalidate all cached search results at once. Plain
    // literal on purpose: referencing queryKeys here would hit the TDZ.
    searchAll: ["notes", "search"],
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

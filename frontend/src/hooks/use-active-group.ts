import { create } from "zustand";

interface ActiveGroupStore {
  activeGroupId: string | null;
  setActiveGroup: (id: string | null) => void;
}

export const useActiveGroup = create<ActiveGroupStore>((set) => ({
  activeGroupId: null,
  setActiveGroup: (id) => set({ activeGroupId: id }),
}));

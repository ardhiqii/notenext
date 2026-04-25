import { create } from "zustand";

interface EditorSettingsStore {
  wordWrap: boolean;
  toggleWordWrap: () => void;
}

export const useEditorSettings = create<EditorSettingsStore>((set) => ({
  wordWrap: true,
  toggleWordWrap: () => set((state) => ({ wordWrap: !state.wordWrap })),
}));

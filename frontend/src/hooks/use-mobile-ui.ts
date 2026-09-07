import { create } from "zustand";

export type MobileSurface = "notes" | "tabs" | "menu" | null;

type MobileUiState = {
  surface: MobileSurface;
  editorFocused: boolean;
  keyboardVisible: boolean;
  setSurface: (surface: MobileSurface) => void;
  toggleSurface: (surface: Exclude<MobileSurface, null>) => void;
  closeSurface: () => void;
  setEditorFocused: (focused: boolean) => void;
  setKeyboardVisible: (visible: boolean) => void;
  reset: () => void;
};

const initialState = {
  surface: null as MobileSurface,
  editorFocused: false,
  keyboardVisible: false,
};

/**
 * Ephemeral compact-layout state. It deliberately does not use persistence:
 * mobile sheets and keyboard state should never survive a route or reload.
 */
export const useMobileUi = create<MobileUiState>((set) => ({
  ...initialState,
  setSurface: (surface) => set({ surface }),
  toggleSurface: (surface) =>
    set((state) => ({ surface: state.surface === surface ? null : surface })),
  closeSurface: () => set({ surface: null }),
  setEditorFocused: (editorFocused) => set({ editorFocused }),
  setKeyboardVisible: (keyboardVisible) => set({ keyboardVisible }),
  reset: () => set(initialState),
}));

export type { MobileUiState };

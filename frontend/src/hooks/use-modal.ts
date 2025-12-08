import { create } from "zustand";

export type ModalType = "search-note";

interface ModalStore {
  type: ModalType | null;
  isOpen: boolean;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  data: {},
  isOpen: false,
  openModal: (type) => {
    set({ type, isOpen: true });
  },
  closeModal: () => {
    set({ type: null, isOpen: false });
  },
}));

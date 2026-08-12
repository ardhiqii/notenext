import { create } from "zustand";

export type ModalType = "search-note" | "connection-note" | "delete-note" | "export-note" | "changelog";

interface ModalData {
  note?: {
    id: string;
    title: string;
  };
  noteId?: string

}

interface CallBack {
  changeCurrentNote?: (noteId: string) => void;
  deleteNote?: (noteId:string)=> void
}

interface Option {
  data?: ModalData;
  callback?: CallBack;
}

interface ModalStore {
  type: ModalType | null;
  isOpen: boolean;
  openModal: (type: ModalType, options?: Option) => void;
  closeModal: () => void;
  data: ModalData;
  callback: CallBack;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  data: {},
  callback: {},
  isOpen: false,
  openModal: (type, options = {}) => {
    // options.data may be omitted (e.g. openModal("connection-note")) —
    // defaulting the whole options object does NOT default data, so the
    // store would carry data: undefined. Modals that read data in render
    // (export-note-modal reads data.noteId) would then crash. Never let
    // the store hold undefined data.
    set({
      type,
      isOpen: true,
      data: options.data ?? {},
      callback: options.callback ?? {},
    });
  },
  closeModal: () => {
    set({ type: null, isOpen: false });
  },
}));

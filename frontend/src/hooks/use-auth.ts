import type { User } from "@/types";
import { create } from "zustand";

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshFailed: boolean;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  setRefreshFailed: (v: boolean) => void;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  refreshFailed: false,
  setToken: (token) => {
    set({
      accessToken: token,
    });
  },
  setUser: (user) => {
    set({
      user,
    });
  },
  logout: () => {
    set({
      user: null,
      accessToken: null,
      refreshFailed: false,
    });
  },
  setRefreshFailed: (v) => {
    set({ refreshFailed: v });
  },
}));

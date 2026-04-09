import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

const getCurrentUser = queryOptions({
  queryKey: queryKeys.auth.me,
  queryFn: async () => {
    const resp = await api.get("/auth/me");
    console.log(resp);
    if (resp.data) {
      useAuth.getState().setUser(resp.data);
    }
    return resp.data;
  },
  staleTime: 5 * 60 * 1000, // 5 Minutes
});

export const AuthQueryOptions = {
  getCurrentUser,
};

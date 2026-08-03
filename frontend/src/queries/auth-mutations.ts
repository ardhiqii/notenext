import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export const AuthMutations = {
  logout: () =>
    useMutation({
      mutationFn: async () => {
        await api.post("/auth/logout");
        return;
      },
      onSuccess: (_data, _vars, _onMutateResult, ctx) => {
        useAuth.getState().logout();
        ctx.client.removeQueries({ queryKey: queryKeys.notes.all });
      },
    }),

  markChangelogSeen: () =>
    useMutation({
      mutationFn: async (version: string) => {
        await api.post("/auth/changelog-seen", { version });
      },
      onSuccess: (_data, version) => {
        const user = useAuth.getState().user;
        if (user) {
          useAuth.getState().setUser({ ...user, last_seen_changelog_version: version });
        }
      },
    }),
};

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
        // Remove BOTH auth.me and notes caches. auth.me has a 5-minute
        // staleTime; leaving it cached means the next login's
        // ensureQueryData returns the STALE cached user WITHOUT calling the
        // queryFn (which is what calls setUser) — the app then renders
        // logged-out chrome (Log in button) while notes load with the fresh
        // token. Refresh "fixes" it only because the reload clears the cache.
        ctx.client.removeQueries({ queryKey: queryKeys.auth.me });
        ctx.client.removeQueries({ queryKey: queryKeys.auth.ws });
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

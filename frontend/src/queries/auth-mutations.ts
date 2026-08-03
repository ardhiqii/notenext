import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

export const AuthMutations = {
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

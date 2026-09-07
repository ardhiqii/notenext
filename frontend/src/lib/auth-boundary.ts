import type { QueryClient } from "@tanstack/react-query";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useAuth } from "@/hooks/use-auth";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { queryKeys } from "@/queries/keys";

const privateQueryKeys = [
  queryKeys.auth.me,
  queryKeys.auth.ws,
  queryKeys.notes.all,
  queryKeys.tabGroups.all,
  queryKeys.tabGroups.withTabs,
] as const;

/**
 * Clear every session-bound cache and ephemeral store before auth state
 * changes. Callers pass their active QueryClient so this helper never creates
 * or reaches for a second client.
 */
export function resetAuthBoundary(queryClient: QueryClient) {
  useActiveGroup.getState().reset();
  useMobileUi.getState().reset();
  useAuth.getState().logout();

  for (const queryKey of privateQueryKeys) {
    queryClient.removeQueries({ queryKey });
  }
}

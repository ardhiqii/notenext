import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useAuth } from "@/hooks/use-auth";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/queries";
import { AuthMutations } from "@/queries/auth-mutations";
import { createTestQueryClient } from "@/test/test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

const user = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  name: "Alice",
  avatarURL: null,
  has_password: true,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("AuthMutations.logout", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    useActiveGroup.getState().reset();
    useMobileUi.getState().reset();
  });

  it("resets auth-boundary state and private caches after logout", async () => {
    vi.mocked(api.post).mockResolvedValue(undefined as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.auth.me, user);
    queryClient.setQueryData(queryKeys.auth.ws, { ticket: "private-ticket" });
    queryClient.setQueryData(queryKeys.notes.tabs, [{ id: "n1" }]);
    queryClient.setQueryData(queryKeys.tabGroups.withTabs, {
      groups: [],
      ungroupedTabs: [],
    });
    useAuth.setState({ user, accessToken: "access-token", refreshFailed: true });
    useActiveGroup.getState().setActiveGroup("g1");
    useMobileUi.getState().setSurface("menu");

    const { result } = renderHook(() => AuthMutations.logout(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().accessToken).toBeNull();
    expect(useActiveGroup.getState().activeGroupId).toBeNull();
    expect(useMobileUi.getState().surface).toBeNull();
    expect(queryClient.getQueryData(queryKeys.auth.me)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.auth.ws)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.notes.tabs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toBeUndefined();
  });
});

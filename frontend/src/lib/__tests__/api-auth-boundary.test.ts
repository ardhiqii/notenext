import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useAuth } from "@/hooks/use-auth";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";

type ResponseInterceptor = {
  rejected?: (error: unknown) => Promise<unknown>;
};

function getResponseRejectionHandler() {
  const handlers = (
    api.interceptors.response as unknown as { handlers: ResponseInterceptor[] }
  ).handlers;
  const handler = handlers.find((entry) => entry.rejected);
  if (!handler?.rejected) {
    throw new Error("response rejection handler is not registered");
  }
  return handler.rejected;
}

describe("api auth-boundary failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    queryClient.clear();
    useAuth.setState({
      user: {
        id: "u1",
        username: "alice",
        email: "alice@example.com",
        name: "Alice",
        avatarURL: null,
        has_password: true,
      },
      accessToken: "access-token",
      refreshFailed: false,
    });
    useActiveGroup.getState().setActiveGroup("g1");
    useMobileUi.getState().setSurface("menu");
    vi.spyOn(axios, "get").mockRejectedValue(new Error("refresh failed"));
  });

  it("resets mobile and private state before rejecting an unrecoverable 401", async () => {
    queryClient.setQueryData(queryKeys.auth.me, { id: "u1" });
    queryClient.setQueryData(queryKeys.auth.ws, { ticket: "private-ticket" });
    queryClient.setQueryData(queryKeys.notes.tabs, [{ id: "private-note" }]);
    queryClient.setQueryData(queryKeys.tabGroups.withTabs, {
      groups: [],
      ungroupedTabs: [],
    });

    const error = {
      config: {
        url: "/notes",
        _retry: false,
        headers: {},
      },
      response: { status: 401 },
    };

    await expect(getResponseRejectionHandler()(error)).rejects.toBe(error);

    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().accessToken).toBeNull();
    expect(useActiveGroup.getState().activeGroupId).toBeNull();
    expect(useMobileUi.getState()).toMatchObject({
      surface: null,
      editorFocused: false,
      keyboardVisible: false,
    });
    expect(queryClient.getQueryData(queryKeys.auth.me)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.auth.ws)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.notes.tabs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.tabGroups.withTabs)).toBeUndefined();
  });

  it("resets the boundary when a retried request is still unauthorized", async () => {
    const error = {
      config: {
        url: "/notes",
        _retry: true,
        headers: {},
      },
      response: { status: 401 },
    };

    await expect(getResponseRejectionHandler()(error)).rejects.toBe(error);

    expect(useAuth.getState().accessToken).toBeNull();
    expect(useActiveGroup.getState().activeGroupId).toBeNull();
    expect(useMobileUi.getState().surface).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });
});

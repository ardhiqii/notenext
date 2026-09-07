import { beforeEach, describe, expect, it } from "vitest";
import { queryKeys } from "@/queries";
import { createTestQueryClient } from "@/test/test-utils";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useAuth } from "@/hooks/use-auth";
import { useMobileUi } from "@/hooks/use-mobile-ui";
import { resetAuthBoundary } from "../auth-boundary";

const user = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  name: "Alice",
  avatarURL: null,
  has_password: true,
};

const note = {
  id: "n1",
  title: "Private note",
  content: "secret",
  positionAt: 1,
  groupId: "g1",
};

describe("resetAuthBoundary", () => {
  beforeEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    useActiveGroup.getState().reset();
    useMobileUi.getState().reset();
  });

  it("clears private query caches and ephemeral stores before a session changes", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.auth.me, user);
    queryClient.setQueryData(queryKeys.auth.ws, { ticket: "private-ticket" });
    queryClient.setQueryData(queryKeys.notes.tabs, [note]);
    queryClient.setQueryData(queryKeys.tabGroups.withTabs, {
      groups: [],
      ungroupedTabs: [note],
    });
    queryClient.setQueryData([...queryKeys.tabGroups.all, "summary"], ["g1"]);

    useAuth.setState({ user, accessToken: "access-token", refreshFailed: true });
    useActiveGroup.getState().setActiveGroup("g1");
    useMobileUi.getState().setSurface("menu");
    useMobileUi.getState().setEditorFocused(true);
    useMobileUi.getState().setKeyboardVisible(true);

    resetAuthBoundary(queryClient);

    expect(useAuth.getState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshFailed: false,
    });
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
    expect(
      queryClient.getQueryData([...queryKeys.tabGroups.all, "summary"]),
    ).toBeUndefined();
  });
});

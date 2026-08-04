import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabsBar from "@/components/tabs-bar";
import { useAuth } from "@/hooks/use-auth";
import { useModal } from "@/hooks/use-modal";
import { APP_VERSION } from "@/lib/version";
import type { User } from "@/types";

const mocks = vi.hoisted(() => ({
  createNewNote: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({ createNewNote: mocks.createNewNote }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useMatchRoute: () => () => undefined,
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
  useQuery: () => ({ data: [], isSuccess: true }),
}));

vi.mock("@/queries", () => ({
  NoteQueryOptions: {},
  GroupQueryOptions: {},
  queryKeys: { notes: { tabs: [] }, tabGroups: { withTabs: [] } },
  NoteMutations: { updateTabPosition: () => ({ mutate: vi.fn() }) },
  GroupMutations: {
    createGroup: () => ({ mutate: vi.fn() }),
    assignTabToGroup: () => ({ mutate: vi.fn() }),
  },
}));

vi.mock("@/queries/auth-mutations", () => ({
  AuthMutations: { logout: () => ({ mutate: mocks.logout }) },
}));

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  username: "alice",
  email: "",
  name: "Alice",
  avatarURL: null,
  has_password: true,
  ...overrides,
});

const bell = () => screen.getByLabelText("Notifications");
const hasDot = () => bell().querySelector(".bg-red-500") !== null;

describe("TabsBar update bell", () => {
  beforeEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    useModal.setState({
      type: null,
      isOpen: false,
      data: {},
      callback: {},
    });
  });

  it("does not render the bell for guests (no user)", () => {
    render(<TabsBar />);
    expect(screen.queryByLabelText("Notifications")).toBeNull();
  });

  it("shows the bell WITHOUT a dot when the changelog is already seen", () => {
    useAuth.setState({
      user: makeUser({ last_seen_changelog_version: APP_VERSION }),
    });
    render(<TabsBar />);
    expect(bell()).toBeInTheDocument();
    expect(hasDot()).toBe(false);
  });

  it("shows a red dot when the current version's changelog is unseen", () => {
    useAuth.setState({ user: makeUser() }); // no last_seen_changelog_version
    render(<TabsBar />);
    expect(hasDot()).toBe(true);
  });

  it("shows a red dot when a stale version was seen", () => {
    useAuth.setState({
      user: makeUser({ last_seen_changelog_version: "0.9.0" }),
    });
    render(<TabsBar />);
    expect(hasDot()).toBe(true);
  });

  it("opens the changelog modal on click", () => {
    useAuth.setState({ user: makeUser() });
    render(<TabsBar />);
    fireEvent.click(bell());
    expect(useModal.getState().type).toBe("changelog");
    expect(useModal.getState().isOpen).toBe(true);
  });
});

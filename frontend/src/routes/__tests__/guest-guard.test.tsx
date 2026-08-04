import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@/types";

// The route file imports these at module level — provide light mocks so the
// import itself doesn't fail. The guard under test only touches useAuth.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
  redirect: (opts: unknown) => ({ __redirect: opts }),
  createFileRoute: () => (opts: unknown) => opts,
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

function mockUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    username: "alice",
    email: "",
    name: "Alice",
    avatarURL: null,
    has_password: true,
    ...overrides,
  };
}

describe("requireGuest (login + register routes)", () => {
  beforeEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
  });

  afterEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
  });

  it("login: passes through when no user is logged in", async () => {
    const { requireGuest } = await import("../login");
    expect(() => requireGuest()).not.toThrow();
  });

  it("login: throws a redirect to / when a user IS logged in", async () => {
    const { requireGuest } = await import("../login");
    useAuth.setState({ user: mockUser(), accessToken: "token" });
    let thrown: unknown;
    try {
      requireGuest();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ __redirect: { to: "/" } });
  });

  it("register: passes through when no user is logged in", async () => {
    const { requireGuest } = await import("../register");
    expect(() => requireGuest()).not.toThrow();
  });

  it("register: throws a redirect to / when a user IS logged in", async () => {
    const { requireGuest } = await import("../register");
    useAuth.setState({ user: mockUser(), accessToken: "token" });
    let thrown: unknown;
    try {
      requireGuest();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ __redirect: { to: "/" } });
  });
});

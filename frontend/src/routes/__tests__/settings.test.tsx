import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { renderWithProviders } from "@/test/test-utils";
import type { User } from "@/types";
import { SettingsPage } from "../_app/settings";

// Router mock — the page only uses useNavigate on the back button.
const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMocks.navigate,
  createFileRoute: () => (opts: unknown) => opts,
}));

const mocks = vi.hoisted(() => ({ logout: vi.fn(() => ({})) }));

vi.mock("@/queries/auth-mutations", () => ({
  AuthMutations: { logout: () => ({ mutate: mocks.logout }) },
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

function mockUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    username: "",
    email: "alice@gmail.com",
    name: "Alice",
    avatarURL: null,
    has_password: false,
    ...overrides,
  };
}

describe("SettingsPage — username & password setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      user: mockUser(),
      accessToken: "token",
      refreshFailed: false,
    });
  });

  afterEach(() => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
  });

  it("shows a combined setup form when the user has NO username and NO password", () => {
    renderWithProviders(<SettingsPage />);

    expect(
      screen.getByText(/Set both a username and a password/i)
    ).toBeInTheDocument();
    // Both fields must be present in the SAME form.
    const usernameInput = screen.getByPlaceholderText(/min 3 characters/i);
    const passwordInput = screen.getByPlaceholderText(/min 8 characters/i);
    expect(usernameInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    // No "Not set" click-to-edit rows in setup state.
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
  });

  it("shows the combined form when only ONE of the two is set", () => {
    // Google user who previously set a username but never a password.
    useAuth.setState({ user: mockUser({ username: "alice" }) });
    renderWithProviders(<SettingsPage />);

    expect(
      screen.getByText(/Set both a username and a password/i)
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("alice")).toBeInTheDocument();
  });

  it("submits username AND password to /auth/bind/credentials on save", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    renderWithProviders(<SettingsPage />);

    fireEvent.change(screen.getByPlaceholderText(/min 3 characters/i), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText(/min 8 characters/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/bind/credentials", {
        username: "alice",
        password: "password123",
      });
    });
  });

  it("does NOT submit when password is too short", () => {
    renderWithProviders(<SettingsPage />);

    fireEvent.change(screen.getByPlaceholderText(/min 3 characters/i), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText(/min 8 characters/i), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows separate editable rows when BOTH username and password are set", () => {
    useAuth.setState({ user: mockUser({ username: "alice", has_password: true }) });
    renderWithProviders(<SettingsPage />);

    expect(
      screen.queryByText(/Set both a username and a password/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    // The username row shows the value; "Signed in as" also contains it, so
    // scope to the row's value span.
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
  });

  it("requires login — renders a notice when not signed in", () => {
    useAuth.setState({ user: null, accessToken: null });
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText(/Please log in/i)).toBeInTheDocument();
  });

  it("calls the logout mutation when clicking Sign out", () => {
    useAuth.setState({
      user: mockUser({ username: "alice", has_password: true }),
    });
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(mocks.logout).toHaveBeenCalled();
  });
});

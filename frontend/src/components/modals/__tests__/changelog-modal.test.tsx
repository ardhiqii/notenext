import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangelogModal from "@/components/modals/changelog-modal";
import { useAuth } from "@/hooks/use-auth";
import { useModal } from "@/hooks/use-modal";
import { api } from "@/lib/api";
import { APP_VERSION } from "@/lib/version";
import { renderWithProviders } from "@/test/test-utils";
import type { User } from "@/types";

// Mock shape follows sidebar.test.tsx conventions — the real axios
// interceptor unwraps resp.data, so tests resolve with {data: ...}.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockUser: User = {
  id: "u1",
  username: "tester",
  email: "tester@example.com",
  name: "Tester",
  avatarURL: null,
  has_password: false,
};

describe("ChangelogModal", () => {
  beforeEach(() => {
    useModal.setState({ type: null, isOpen: false, data: {}, callback: {} });
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    localStorage.clear();
    vi.mocked(api.post).mockReset();
  });

  it("renders the current version title and feature/fix lists when opened", () => {
    useModal.getState().openModal("changelog");

    renderWithProviders(<ChangelogModal />);

    expect(screen.getByText("NoteNext 1.0")).toBeInTheDocument();
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
    expect(screen.getByText("What's new")).toBeInTheDocument();
    expect(screen.getByText("Bug fixes")).toBeInTheDocument();
    expect(
      screen.getByText("Tab groups — organize notes with drag & drop"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Real-time collaboration via WebSocket"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tab title now always matches the sidebar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hardened note ownership and auth")).toBeInTheDocument();
  });

  it("calls POST /auth/changelog-seen and closes when a logged-in user clicks Got it", async () => {
    useAuth.setState({ user: mockUser, accessToken: "token", refreshFailed: false });
    useModal.getState().openModal("changelog");
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);

    renderWithProviders(<ChangelogModal />);

    await userEvent.click(screen.getByRole("button", { name: "Got it" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/changelog-seen", {
        version: APP_VERSION,
      }),
    );
    // Mutation onSuccess updates the zustand user and closes the modal.
    await waitFor(() => expect(useModal.getState().type).toBeNull());
    expect(useAuth.getState().user?.last_seen_changelog_version).toBe(APP_VERSION);
    await waitFor(() =>
      expect(screen.queryByText("NoteNext 1.0")).not.toBeInTheDocument(),
    );
  });

  it("writes localStorage and closes when a guest clicks Got it", async () => {
    useAuth.setState({ user: null, accessToken: null, refreshFailed: false });
    useModal.getState().openModal("changelog");

    renderWithProviders(<ChangelogModal />);

    await userEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(localStorage.getItem("notenext:changelog-seen")).toBe(APP_VERSION);
    expect(useModal.getState().type).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByText("NoteNext 1.0")).not.toBeInTheDocument();
  });
});

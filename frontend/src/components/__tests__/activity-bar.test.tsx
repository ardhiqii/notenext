import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityBar from "@/components/activity-bar";
import { useModal } from "@/hooks/use-modal";
import { renderWithProviders } from "@/test/test-utils";

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

describe("ActivityBar", () => {
  beforeEach(() => {
    useModal.getState().closeModal();
  });

  it("renders the sidebar toggle and search buttons", () => {
    renderWithProviders(<ActivityBar collapsed={false} onToggle={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Hide navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search notes" }),
    ).toBeInTheDocument();
  });

  it("opens the changelog modal from the What's new button (visible for everyone, incl. guests)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActivityBar collapsed={false} onToggle={() => {}} />);

    await user.click(screen.getByRole("button", { name: "What's new" }));

    expect(useModal.getState().type).toBe("changelog");
    expect(useModal.getState().isOpen).toBe(true);
  });
});

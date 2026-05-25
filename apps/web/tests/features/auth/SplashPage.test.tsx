import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type * as ReactRouterDom from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import SplashPage from "../../../src/features/auth/SplashPage";

function renderSplash(initialEntries: { pathname: string; state?: unknown }[] = [
  { pathname: "/auth/splash" },
]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SplashPage />
    </MemoryRouter>,
  );
}

describe("SplashPage", () => {
  beforeEach(() => navigateMock.mockReset());

  it("YesMan title / tagline / はじめる CTA を表示する", () => {
    renderSplash();
    expect(screen.getByRole("heading", { name: "YesMan" })).toBeInTheDocument();
    expect(screen.getByText(/人間最後の仕事は/)).toBeInTheDocument();
    expect(screen.getByText(/YES で承認すること/)).toBeInTheDocument();
    expect(screen.getByTestId("splash-start")).toHaveTextContent("はじめる");
  });

  it("[はじめる →] click で /auth/signin に navigate される", async () => {
    const user = userEvent.setup();
    renderSplash();
    await user.click(screen.getByRole("button", { name: /はじめる/ }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/auth/signin",
      expect.objectContaining({ state: { from: { pathname: "/" } } }),
    );
  });

  it("location.state.from がある場合、navigate state.from が引き継がれる", async () => {
    const user = userEvent.setup();
    renderSplash([
      { pathname: "/auth/splash", state: { from: { pathname: "/score" } } },
    ]);
    await user.click(screen.getByRole("button", { name: /はじめる/ }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/auth/signin",
      expect.objectContaining({ state: { from: { pathname: "/score" } } }),
    );
  });

  it("mockup §1: 3 blob avatar が render される (orange/green/blue)", () => {
    renderSplash();
    // BlobAvatar は role=img + data-testid="blob-avatar"
    const blobs = screen.getAllByTestId("blob-avatar");
    expect(blobs).toHaveLength(3);
    expect(blobs[0]).toHaveAttribute("data-blob-color", "orange");
    expect(blobs[1]).toHaveAttribute("data-blob-color", "green");
    expect(blobs[2]).toHaveAttribute("data-blob-color", "blue");
  });
});

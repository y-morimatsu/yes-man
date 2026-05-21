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

  it("YESMAN wordmark / tagline / disclaimer / CTA / secondary link を表示する", () => {
    renderSplash();
    expect(screen.getByRole("heading", { name: "YESMAN" })).toBeInTheDocument();
    expect(screen.getByText("人間最後の仕事は、")).toBeInTheDocument();
    expect(screen.getByText(/YES で承認すること/)).toBeInTheDocument();
    expect(screen.getByText(/逆説的設計/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /はじめる/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /すでにアカウントがある方は サインイン/ }),
    ).toBeInTheDocument();
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

  it("secondary link click でも /auth/signin に navigate される", async () => {
    const user = userEvent.setup();
    renderSplash();
    await user.click(
      screen.getByRole("button", { name: /すでにアカウントがある方は サインイン/ }),
    );
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

  it("🪞 emoji は aria-hidden で screen reader にスキップされる", () => {
    renderSplash();
    const emoji = screen.getByText("🪞");
    expect(emoji).toHaveAttribute("aria-hidden", "true");
  });
});

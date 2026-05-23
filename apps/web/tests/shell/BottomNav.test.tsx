import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "../../src/shell/BottomNav";

function setup(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders 4 tabs (Home / 決定 / スコア / プロフィール)", () => {
    setup("/");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("決定")).toBeInTheDocument();
    expect(screen.getByText("スコア")).toBeInTheDocument();
    expect(screen.getByText("プロフィール")).toBeInTheDocument();
  });

  it("marks Home tab active when on /", () => {
    setup("/");
    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(homeLink?.className).toContain("text-brand-700");
  });

  it("marks 決定 tab active when on /decision", () => {
    setup("/decision");
    const decisionLink = screen.getByText("決定").closest("a");
    expect(decisionLink).toHaveAttribute("aria-current", "page");
    expect(decisionLink?.className).toContain("text-brand-700");
    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).not.toHaveAttribute("aria-current");
  });

  it("marks スコア tab active when on /score", () => {
    setup("/score");
    const scoreLink = screen.getByText("スコア").closest("a");
    expect(scoreLink).toHaveAttribute("aria-current", "page");
  });

  it("marks プロフィール tab active when on /profile", () => {
    setup("/profile");
    const profileLink = screen.getByText("プロフィール").closest("a");
    expect(profileLink).toHaveAttribute("aria-current", "page");
  });

  it("no active tab when on /personas (excluded from BottomNav)", () => {
    setup("/personas");
    const allLinks = screen.getAllByRole("link");
    for (const link of allLinks) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("each tab href points to correct route", () => {
    setup("/");
    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("決定").closest("a")).toHaveAttribute("href", "/decision");
    expect(screen.getByText("スコア").closest("a")).toHaveAttribute("href", "/score");
    expect(screen.getByText("プロフィール").closest("a")).toHaveAttribute("href", "/profile");
  });
});

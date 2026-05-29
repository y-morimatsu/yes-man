/**
 * BottomNav — 4-tab (ホーム / スコア / ペルソナ / プロフィール).
 * 2026-05-24 v2: 「ペルソナ」 tab を追加 (/personas/selection).
 */
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

describe("BottomNav (4-tab)", () => {
  it("renders 4 tabs (ホーム / スコア / ペルソナ / プロフィール)", () => {
    setup("/");
    expect(screen.getByText("ホーム")).toBeInTheDocument();
    expect(screen.getByText("スコア")).toBeInTheDocument();
    expect(screen.getByText("ペルソナ")).toBeInTheDocument();
    expect(screen.getByText("プロフィール")).toBeInTheDocument();
  });

  it("marks ホーム tab active when on /", () => {
    setup("/");
    const homeLink = screen.getByText("ホーム").closest("a");
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks スコア tab active when on /score", () => {
    setup("/score");
    const link = screen.getByText("スコア").closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks ペルソナ tab active when on /personas/selection", () => {
    setup("/personas/selection");
    const link = screen.getByText("ペルソナ").closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks ペルソナ tab active also on /personas (list)", () => {
    setup("/personas");
    const link = screen.getByText("ペルソナ").closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks プロフィール tab active when on /profile", () => {
    setup("/profile");
    const link = screen.getByText("プロフィール").closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("each tab href points to correct route", () => {
    setup("/");
    expect(screen.getByText("ホーム").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("スコア").closest("a")).toHaveAttribute(
      "href",
      "/score",
    );
    expect(screen.getByText("ペルソナ").closest("a")).toHaveAttribute(
      "href",
      "/personas/selection",
    );
    expect(screen.getByText("プロフィール").closest("a")).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});

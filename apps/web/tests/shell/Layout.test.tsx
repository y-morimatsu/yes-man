import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../src/shell/AuthProvider", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useAuth } from "../../src/shell/AuthProvider";
import { Layout } from "../../src/shell/Layout";

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>HOME</div>} />
          <Route path="/score" element={<div>SCORE</div>} />
          <Route path="/auth/splash" element={<div>SPLASH</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders sticky header with brand logo", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    const logo = screen.getByText(/🪞 YesMan/);
    expect(logo).toBeInTheDocument();
    const header = logo.closest("header");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
    expect(header?.className).toContain("z-40");
  });

  it("renders Sign out button when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("hides Sign out button when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "unauthenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/auth/splash");
    expect(screen.queryByRole("button", { name: /Sign out/ })).not.toBeInTheDocument();
  });

  it("shows BottomNav when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    expect(screen.getByRole("navigation", { name: "メインナビゲーション" })).toBeInTheDocument();
  });

  it("hides BottomNav when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "unauthenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/auth/splash");
    expect(screen.queryByRole("navigation", { name: "メインナビゲーション" })).not.toBeInTheDocument();
  });

  it("Top header has no nav icons (⚙️📊👤 removed)", () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      refresh: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderWithRoute("/");
    const header = screen.getByText(/🪞 YesMan/).closest("header");
    expect(header?.textContent).not.toContain("⚙️");
    expect(header?.textContent).not.toContain("📊");
    expect(header?.textContent).not.toContain("👤");
  });
});

import { describe, expect, it } from "vitest";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { render, screen } from "@testing-library/react";

/**
 * routes.tsx 自体は createBrowserRouter で副作用、ここでは MemoryRouter で
 * 同等の route 構造を再現して 404 → / redirect の動作を smoke test.
 */
function TestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<div>Home</div>} />
      <Route path="/known" element={<div>Known page</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

describe("routes", () => {
  it("renders home for /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders known page", () => {
    render(
      <MemoryRouter initialEntries={["/known"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("Known page")).toBeInTheDocument();
  });

  it("redirects unknown path to /", () => {
    render(
      <MemoryRouter initialEntries={["/unknown/deep/path"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});

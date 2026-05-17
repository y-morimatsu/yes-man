import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";
import { AuthProvider } from "../../src/shell/AuthProvider";
import { RequireAuth } from "../../src/shell/RequireAuth";

function setup(initialEntries: string[] = ["/private"]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/private"
            element={
              <RequireAuth>
                <div>Private content</div>
              </RequireAuth>
            }
          />
          <Route path="/auth/signin" element={<div>Sign in page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("RequireAuth", () => {
  it("renders children when authenticated", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Private content")).toBeInTheDocument();
    });
  });

  it("redirects to /auth/signin when unauthenticated", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({ tokens: undefined } as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText("Sign in page")).toBeInTheDocument();
    });
  });
});

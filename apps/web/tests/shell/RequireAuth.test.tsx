import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";

// .env.local に VITE_AUTH_BYPASS=true が設定されている場合、AuthProvider が bypass mode に
// なり fetchAuthSession が呼ばれないため、env.ts を明示的に mock して Cognito mode を強制する
vi.mock("../../src/shell/env", () => ({
  env: {
    apiBaseUrl: "http://localhost:8000",
    cognitoRegion: "ap-northeast-1",
    cognitoUserPoolId: "ap-northeast-1_test",
    cognitoAppClientId: "test-client",
    cognitoHostedUiUrl: "https://test.auth.example.com",
    appVersion: "test",
    isDev: true,
    authBypass: false,
    mockUserSub: "11111111-1111-1111-1111-111111111111",
    mockUserEmail: "test@example.com",
  },
}));

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
          <Route path="/auth/splash" element={<div>Splash page</div>} />
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

  it("redirects to /auth/splash when unauthenticated", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({ tokens: undefined } as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText("Splash page")).toBeInTheDocument();
    });
  });
});

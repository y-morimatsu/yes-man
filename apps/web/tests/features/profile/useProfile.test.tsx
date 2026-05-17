import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { useProfile, useDeleteProfile } from "../../../src/features/profile/useProfile";

const server = setupServer();

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <AuthProvider>
      <ApiProvider>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </ApiProvider>
    </AuthProvider>
  );
}

describe("useProfile hooks", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("useProfile fetches /v1/profiles/me", async () => {
    server.use(
      http.get("http://localhost:8000/v1/profiles/me", () =>
        HttpResponse.json({ user_id: "user-1", email: "test@example.com" }),
      ),
    );
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ user_id: "user-1" });
  });

  it("useDeleteProfile DELETE /v1/profiles/me returns 204", async () => {
    server.use(
      http.delete("http://localhost:8000/v1/profiles/me", () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const { result } = renderHook(() => useDeleteProfile(), { wrapper });
    await result.current.mutateAsync();
    expect(result.current.isSuccess).toBe(true);
  });
});

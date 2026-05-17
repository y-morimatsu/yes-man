import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { useMyPersonas, useCreatePersona } from "../../../src/features/persona/usePersona";

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

describe("usePersona hooks", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("useMyPersonas fetches /v1/personas/me", async () => {
    server.use(
      http.get("http://localhost:8000/v1/personas/me", () =>
        HttpResponse.json([{ id: "p1", name: "test" }]),
      ),
    );
    const { result } = renderHook(() => useMyPersonas(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "p1", name: "test" }]);
  });

  it("useCreatePersona posts to /v1/personas/me", async () => {
    let received: unknown = null;
    server.use(
      http.post("http://localhost:8000/v1/personas/me", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ id: "new1", name: "Test" }, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useCreatePersona(), { wrapper });
    await result.current.mutateAsync({
      name: "Test",
      description: null,
      prompt_text: "x".repeat(40),
      avatar_url: null,
    });
    expect((received as { name: string }).name).toBe("Test");
  });
});

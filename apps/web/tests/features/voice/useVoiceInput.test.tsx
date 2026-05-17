import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { useVoiceInput } from "../../../src/features/voice/useVoiceInput";

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

describe("useVoiceInput", () => {
  beforeAll(() =>
    server.listen({ onUnhandledRequest: "warn" }),
  );
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("initial state is idle", () => {
    server.use(
      http.get("http://localhost:8000/v1/voice/config", () =>
        HttpResponse.json({ backend: "aws", tts_supported: true, stt_supported: true }),
      ),
    );
    const { result } = renderHook(() => useVoiceInput(), { wrapper });
    expect(result.current.state).toBe("idle");
    expect(result.current.transcript).toBe("");
  });

  it("error state when voice config unavailable initially", async () => {
    server.use(
      http.get("http://localhost:8000/v1/voice/config", () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useVoiceInput(), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
  });

  it("error state for web-speech-api backend (MVP unsupported in useVoiceInput)", async () => {
    server.use(
      http.get("http://localhost:8000/v1/voice/config", () =>
        HttpResponse.json({
          backend: "web-speech-api",
          tts_supported: false,
          stt_supported: false,
        }),
      ),
    );
    const { result } = renderHook(() => useVoiceInput(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
  });
});

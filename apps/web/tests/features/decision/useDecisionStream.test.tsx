import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { useDecisionStream } from "../../../src/features/decision/useDecisionStream";

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

describe("useDecisionStream", () => {
  it("returns startStream + abort functions", () => {
    const { result } = renderHook(
      () =>
        useDecisionStream({
          onStart: () => {},
          onUtterance: () => {},
          onProposal: () => {},
          onComplete: () => {},
          onError: () => {},
        }),
      { wrapper },
    );
    expect(typeof result.current.startStream).toBe("function");
    expect(typeof result.current.abort).toBe("function");
  });

  it("startStream is stable across rerenders with new callbacks (useRef pattern)", () => {
    const { result, rerender } = renderHook(
      (cb) =>
        useDecisionStream(cb ?? { onStart: () => {}, onUtterance: () => {} }),
      { wrapper },
    );
    const first = result.current.startStream;
    // 新しい callbacks object で rerender
    rerender({ onStart: () => {}, onUtterance: () => {} } as any);
    expect(result.current.startStream).toBe(first);
  });
});

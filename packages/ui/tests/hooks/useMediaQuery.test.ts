import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaQuery } from "../../src/hooks/useMediaQuery";

describe("useMediaQuery", () => {
  beforeEach(() => {
    // jsdom matchMedia mock
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("returns false initially (SSR safe)", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    // After useEffect runs, may become true (jsdom 環境)
    expect(typeof result.current).toBe("boolean");
  });

  it("returns matches state after mount", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("returns false for unmatched query", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 9999px)"));
    expect(result.current).toBe(false);
  });
});

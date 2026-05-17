import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ToastProvider } from "../../src/primitives/ToastProvider";
import { useToast } from "../../src/hooks/useToast";

describe("useToast hook", () => {
  it("returns context with push function inside ToastProvider", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    expect(typeof result.current.push).toBe("function");
  });

  it("throws when used outside ToastProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(/within ToastProvider/);
    consoleError.mockRestore();
  });
});

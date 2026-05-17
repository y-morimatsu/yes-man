import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { YesmanApiClient } from "@yesman/api-client";
import { AuthProvider } from "../../src/shell/AuthProvider";
import { ApiProvider, useApi } from "../../src/shell/ApiProvider";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ApiProvider>{children}</ApiProvider>
    </AuthProvider>
  );
}

describe("ApiProvider", () => {
  it("provides YesmanApiClient instance via useApi", () => {
    const { result } = renderHook(() => useApi(), { wrapper: Wrapper });
    expect(result.current).toBeInstanceOf(YesmanApiClient);
  });

  it("client instance is stable across rerenders (ultrathink C1 useRef pattern)", () => {
    const { result, rerender } = renderHook(() => useApi(), { wrapper: Wrapper });
    const firstClient = result.current;
    rerender();
    rerender();
    // ultrathink NFR Design C1: useRef isolation で参照同一性保証
    expect(result.current).toBe(firstClient);
  });

  it("throws when useApi used outside ApiProvider", () => {
    const { result } = renderHook(
      () => {
        try {
          return useApi();
        } catch (e) {
          return e instanceof Error ? e.message : "";
        }
      },
      { wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider> },
    );
    expect(typeof result.current === "string" ? result.current : "").toMatch(
      /within ApiProvider/,
    );
  });
});

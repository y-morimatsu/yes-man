import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchAuthSession } from "aws-amplify/auth";
import { AuthProvider, useAuth } from "../../src/shell/AuthProvider";

describe("AuthProvider", () => {
  it("initial status is loading, transitions to authenticated", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(["loading", "authenticated"]).toContain(result.current.status);
    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(result.current.sub).toBe("user-1");
    expect(result.current.email).toBe("test@example.com");
  });

  it("status unauthenticated when tokens undefined", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({
      tokens: undefined,
    } as never);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });
  });

  it("status unauthenticated when fetchAuthSession rejects", async () => {
    vi.mocked(fetchAuthSession).mockRejectedValueOnce(new Error("no session"));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });
  });

  it("throws when useAuth used outside AuthProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/within AuthProvider/);
    consoleError.mockRestore();
  });
});

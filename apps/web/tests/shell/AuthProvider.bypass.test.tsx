import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// ⚠ env.authBypass = true をモジュール load 前にモック (env.ts は読み取り 1 回キャッシュ)
vi.mock("../../src/shell/env", () => ({
  env: {
    apiBaseUrl: "http://localhost:8000",
    cognitoRegion: "ap-northeast-1",
    cognitoUserPoolId: "ap-northeast-1_test",
    cognitoAppClientId: "test-client",
    cognitoHostedUiUrl: "https://test.auth.example.com",
    appVersion: "test",
    isDev: true,
    authBypass: true,
    mockUserSub: "11111111-1111-1111-1111-111111111111",
    mockUserEmail: "test@example.com",
  },
}));

import { AuthProvider, useAuth } from "../../src/shell/AuthProvider";
import { signIn, signOutUser } from "../../src/shell/auth";
import { registerUser, setCurrentEmail } from "../../src/shell/mockAuthStorage";

describe("AuthProvider — bypass mode", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("localStorage 未設定 → status=unauthenticated", () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.email).toBeNull();
  });

  it("registerUser + setCurrentEmail 済み → status=authenticated, email=current, sub=MockUser.sub", () => {
    const created = registerUser("taro@example.com", "Taro");
    setCurrentEmail("taro@example.com");
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("authenticated");
    expect(result.current.email).toBe("taro@example.com");
    // env.mockUserSub ではなく、ユーザ単位に採番された sub が出る (multi-user)
    expect(result.current.sub).toBe(created.sub);
    expect(result.current.sub).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("別 email でサインインすると別 sub になる (multi-user)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await signIn("alice@example.com");
      await result.current.refresh();
    });
    const subAlice = result.current.sub;
    await act(async () => {
      await signOutUser();
      await signIn("bob@example.com");
      await result.current.refresh();
    });
    expect(result.current.sub).not.toBe(subAlice);
    expect(result.current.email).toBe("bob@example.com");
  });

  it("signIn(email) → refresh() → authenticated に遷移", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("unauthenticated");

    await act(async () => {
      await signIn("taro@example.com");
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.email).toBe("taro@example.com");
  });

  it("signOutUser() → refresh() → unauthenticated に遷移", async () => {
    registerUser("taro@example.com");
    setCurrentEmail("taro@example.com");
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("authenticated");

    await act(async () => {
      await signOutUser();
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.email).toBeNull();
  });

  it("セッション永続化: signIn 後に AuthProvider を再 mount しても authenticated", async () => {
    // 1 度目: signIn
    {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => {
        await signIn("taro@example.com");
        await result.current.refresh();
      });
    }
    // 2 度目: 新しい renderHook = sim reload
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("authenticated");
    expect(result.current.email).toBe("taro@example.com");
  });

  it("セッション永続化: signOutUser 後に再 mount しても unauthenticated", async () => {
    registerUser("taro@example.com");
    setCurrentEmail("taro@example.com");
    // 1 度目: signOut
    {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => {
        await signOutUser();
        await result.current.refresh();
      });
    }
    // 2 度目: 新しい renderHook = sim reload
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe("unauthenticated");
  });
});

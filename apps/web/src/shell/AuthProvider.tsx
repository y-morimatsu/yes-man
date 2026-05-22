/**
 * AuthProvider — shared auth state (FD §5.2 + ultrathink FD C1).
 *
 * - 実 Cognito mode: fetchAuthSession で session 取得
 * - bypass mode: mockAuthStorage (localStorage) で current-email を読む
 *   → reload/再起動でも Sign out するまで authenticated 保持
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { env } from "./env";
import * as mockAuthStorage from "./mockAuthStorage";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  sub: string | null;
  email: string | null;
  /** 表示名. bypass=MockUser.display_name / Cognito=idToken `name` claim (取得できない場合は null) */
  display_name: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface BypassSnapshot {
  status: AuthStatus;
  sub: string | null;
  email: string | null;
  display_name: string | null;
}

function readBypassSnapshot(): BypassSnapshot {
  const current = mockAuthStorage.getCurrentUser();
  if (!current) {
    return { status: "unauthenticated", sub: null, email: null, display_name: null };
  }
  return {
    status: "authenticated",
    sub: current.sub, // multi-user 採番: MockUser.sub を API Bearer にも埋め込み Profile PK と整合
    email: current.email,
    display_name: current.display_name ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = env.authBypass
    ? readBypassSnapshot()
    : {
        status: "loading" as AuthStatus,
        sub: null,
        email: null,
        display_name: null,
      };

  const [status, setStatus] = useState<AuthStatus>(initial.status);
  const [sub, setSub] = useState<string | null>(initial.sub);
  const [email, setEmail] = useState<string | null>(initial.email);
  const [displayName, setDisplayName] = useState<string | null>(initial.display_name);

  const refresh = useCallback(async () => {
    if (env.authBypass) {
      const snap = readBypassSnapshot();
      setSub(snap.sub);
      setEmail(snap.email);
      setDisplayName(snap.display_name);
      setStatus(snap.status);
      return;
    }
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        const payload = idToken.payload;
        setSub(typeof payload.sub === "string" ? payload.sub : null);
        setEmail(typeof payload.email === "string" ? payload.email : null);
        // Cognito の idToken は通常 `name` claim を持つ (profile scope 取得時)
        setDisplayName(typeof payload.name === "string" ? payload.name : null);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    // bypass は initial state で確定済みなので skip。
    // real Cognito のみ mount 時に session fetch
    if (env.authBypass) return;
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ status, sub, email, display_name: displayName, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

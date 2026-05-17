/**
 * AuthProvider — shared auth state (FD §5.2 + ultrathink FD C1).
 *
 * session を mount 時 1 回取得、route 切替で flicker しない設計.
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

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  sub: string | null;
  email: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    env.authBypass ? "authenticated" : "loading",
  );
  const [sub, setSub] = useState<string | null>(
    env.authBypass ? env.mockUserSub : null,
  );
  const [email, setEmail] = useState<string | null>(
    env.authBypass ? env.mockUserEmail : null,
  );

  const refresh = useCallback(async () => {
    // VITE_AUTH_BYPASS: e2e / dev で Cognito を skip、固定 mock user を返却.
    if (env.authBypass) {
      setSub(env.mockUserSub);
      setEmail(env.mockUserEmail);
      setStatus("authenticated");
      return;
    }
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        const payload = idToken.payload;
        setSub(typeof payload.sub === "string" ? payload.sub : null);
        setEmail(typeof payload.email === "string" ? payload.email : null);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (env.authBypass) return; // 初期 state で authenticated 済、追加 fetch 不要
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, sub, email, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

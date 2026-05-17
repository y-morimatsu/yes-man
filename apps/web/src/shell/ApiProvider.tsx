/**
 * ApiProvider — YesmanApiClient context (NFR Design §9 + ultrathink C1).
 *
 * useRef pattern で latest refresh capture、useMemo deps=[] で client 再生成防止.
 * AuthProvider の refresh 参照変化に影響されない isolation 確保.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { YesmanApiClient, type ApiError } from "@yesman/api-client";
import { CognitoTokenProvider } from "./auth";
import { env } from "./env";
import { useAuth } from "./AuthProvider";

const ApiContext = createContext<YesmanApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const { refresh } = useAuth();
  // ultrathink NFR Design C1: useRef で latest refresh capture
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const client = useMemo(
    () =>
      new YesmanApiClient({
        baseUrl: env.apiBaseUrl,
        tokenProvider: new CognitoTokenProvider(),
        defaultHeaders: { "X-Client-Version": env.appVersion },
        onError: async (err: ApiError) => {
          if (err.is("unauthorized")) {
            await refreshRef.current();
          }
        },
      }),
    [],
  );

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): YesmanApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApi must be used within ApiProvider");
  return ctx;
}

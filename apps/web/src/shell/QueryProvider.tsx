/**
 * QueryProvider — React Query (TanStack v5) Context (U7d NFR Design §5).
 *
 * ultrathink:
 * - FD C1: useState(createClient) で per-Provider instance、test isolation + HMR safe
 * - NFR Req Imp2: ReactQueryDevtools は import.meta.env.DEV で prod tree-shake
 * - NFR Design I1: Vite static replacement + Rollup DCE + sideEffects:false で tree-shake 保証
 */
"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // ultrathink U7d FD C1: per-Provider instance
  const [queryClient] = useState(createClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* prod build で Vite が import.meta.env.DEV を false 置換 → Rollup DCE で除去 */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

/**
 * usePersonaPool — React Query hooks for /v1/persona-pool/* (v3-γ Task 4 + 7).
 *
 * - useAnonymousRandom: GET /random?n=2、shuffle 用に refetch 公開
 * - usePoolStatus: GET /me — opt-in 状態 + preview + guard (Task 7 OptInCard 用)
 * - useOptInMutation / useOptOutMutation: Task 7 で使用
 * - useMyCitations / useCitedByMe: Task 6/7 で使用
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

const POOL_KEY = ["persona-pool"] as const;

/** GET /v1/persona-pool/list?limit=N — selection UI 用 (caller exclude された anonymous 一覧). */
export function useAnonymousList(limit: number = 20) {
  const api = useApi();
  return useQuery({
    queryKey: [...POOL_KEY, "list", limit],
    queryFn: () => api.personaPool.list(limit),
    staleTime: 60_000,
  });
}

/** GET /v1/persona-pool/me — opt-in 状態 + preview + guard. */
export function usePoolStatus() {
  const api = useApi();
  return useQuery({
    queryKey: [...POOL_KEY, "status"],
    queryFn: () => api.personaPool.getStatus(),
  });
}

/** POST /v1/persona-pool/opt-in — 422 は ApiError として throw、caller で isInsufficientSignalsError() 判定. */
export function useOptInMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.personaPool.optIn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
    },
  });
}

/** DELETE /v1/persona-pool/opt-in — idempotent. */
export function useOptOutMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.personaPool.optOut(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
    },
  });
}

/** GET /v1/persona-pool/me/citations — 「今日 N 件」(US-2.2). */
export function useMyCitations() {
  const api = useApi();
  return useQuery({
    queryKey: [...POOL_KEY, "citations"],
    queryFn: () => api.personaPool.myCitations(),
  });
}

/** GET /v1/persona-pool/cited-by-me — 過去召喚履歴 (US-3.1). */
export function useCitedByMe() {
  const api = useApi();
  return useQuery({
    queryKey: [...POOL_KEY, "cited-by-me"],
    queryFn: () => api.personaPool.citedByMe(),
  });
}

/**
 * useDecision — mutation + nudge polling (U7d FD §3.3 + NFR Design §10).
 *
 * ultrathink U7d NFR Design I3: useNudge は dataUpdatedAt 経過 30s で polling 停止.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useChooseMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: "yes" | "no" }) =>
      api.decisions.choose(id, choice),
    onSuccess: () => {
      // score を invalidate (decision で更新される)
      qc.invalidateQueries({ queryKey: ["score"] });
      // 「最近の Yes 採択」リストも更新 (useDecisionHistory の queryKey=["decisions", "history", ...]).
      // 旧コードは ["score"] のみで decisions キャッシュが残り、直前 YES が
      // 最大 staleTime=30s 反映されない bug を起こしていた。
      qc.invalidateQueries({ queryKey: ["decisions"] });
    },
  });
}

export function useDecisionHistory(opts?: {
  limit?: number;
  choice?: "yes" | "no" | "all";
}) {
  const api = useApi();
  return useQuery({
    queryKey: ["decisions", "history", opts ?? {}],
    queryFn: () => api.decisions.history(opts),
    staleTime: 30_000,
  });
}

export function useNudge(decisionId: string | null, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ["nudge", decisionId],
    queryFn: () => api.decisions.getNudge(decisionId!),
    enabled: enabled && !!decisionId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.status !== "pending") return false;
      // ultrathink U7d NFR Design I3: 30s で polling 諦め
      const elapsed = Date.now() - (q.state.dataUpdatedAt ?? Date.now());
      if (elapsed > 30_000) return false;
      return 2000;
    },
  });
}

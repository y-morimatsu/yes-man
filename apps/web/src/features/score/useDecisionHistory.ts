/** useDecisionHistory — React Query hook for /v1/decisions (Yes 採択履歴 + attempt_count). */
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useDecisionHistory(opts?: { limit?: number }) {
  const api = useApi();
  const limit = opts?.limit ?? 20;
  return useQuery({
    queryKey: ["decisions", "history", "yes", limit],
    queryFn: () => api.decisions.history({ limit, choice: "yes" }),
    staleTime: 30_000,
  });
}

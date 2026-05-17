/** useScore — React Query hook for /v1/scores/me. */
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useScore() {
  const api = useApi();
  return useQuery({
    queryKey: ["score", "me"],
    queryFn: () => api.scores.getMe(),
    staleTime: 10_000,
  });
}

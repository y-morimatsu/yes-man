/** usePreference — React Query hooks for /v1/preferences/me. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function usePreference() {
  const api = useApi();
  return useQuery({
    queryKey: ["preference", "me"],
    queryFn: () => api.preferences.getMe(),
  });
}

export function useResetPreference() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.preferences.resetMe(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preference"] });
    },
  });
}

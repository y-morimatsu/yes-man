/** useProfile — React Query hooks for /v1/profiles/me. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useProfile() {
  const api = useApi();
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => api.profiles.getMe(),
  });
}

export function useUpdateProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) =>
      api.profiles.updateMe(payload as Parameters<typeof api.profiles.updateMe>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useDeleteProfile() {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.profiles.deleteMe(),
  });
}

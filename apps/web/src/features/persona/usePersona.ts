/**
 * usePersona — React Query hooks for Persona endpoints (U7d FD §4).
 *
 * 2026-05-24 v4: 旧 useSelection / useSetSelection / useResetSelection を撤去.
 *   新 unified selection は features/persona/useUnifiedSelection.ts (localStorage ベース).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PersonaCreate, SharedSort } from "@yesman/api-client";
import { useApi } from "../../shell/ApiProvider";

export function useMyPersonas() {
  const api = useApi();
  return useQuery({
    queryKey: ["persona", "list", "my"],
    queryFn: () => api.personas.listMy(),
  });
}

export function useBuiltinPersonas() {
  const api = useApi();
  return useQuery({
    queryKey: ["persona", "list", "builtin"],
    queryFn: () => api.personas.listBuiltin(),
    staleTime: 60 * 60_000, // 1 hour、builtin は変動しない
  });
}

export function useSharedPersonas(params: {
  page?: number;
  page_size?: number;
  sort?: SharedSort;
}) {
  const api = useApi();
  return useQuery({
    queryKey: ["persona", "list", "shared", params],
    queryFn: () => api.personas.listShared(params),
  });
}

export function useCreatePersona() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PersonaCreate) => api.personas.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persona", "list", "my"] });
    },
  });
}


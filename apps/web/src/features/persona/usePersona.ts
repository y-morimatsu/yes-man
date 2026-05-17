/**
 * usePersona — React Query hooks for Persona endpoints (U7d FD §4).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PersonaCreate,
  PersonaSelectionUpdate,
  SharedSort,
} from "@yesman/api-client";
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

export function useSelection() {
  const api = useApi();
  return useQuery({
    queryKey: ["persona", "selection", "me"],
    queryFn: () => api.personaSelections.getMe(),
  });
}

export function useSetSelection() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PersonaSelectionUpdate) => api.personaSelections.setMe(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persona", "selection"] });
    },
  });
}

export function useResetSelection() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.personaSelections.resetMe(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persona", "selection"] });
    },
  });
}

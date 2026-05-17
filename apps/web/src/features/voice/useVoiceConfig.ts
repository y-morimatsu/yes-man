/**
 * useVoiceConfig — backend config (aws/web-speech-api/mock) 取得.
 *
 * ultrathink U7d FD I3: React Query で 1h cache、毎 mount fetch 回避.
 */
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useVoiceConfig() {
  const api = useApi();
  return useQuery({
    queryKey: ["voice", "config"],
    queryFn: () => api.voice.getConfig(),
    staleTime: 60 * 60_000,        // 1 hour
    gcTime: 24 * 60 * 60_000,      // 24 hour
  });
}

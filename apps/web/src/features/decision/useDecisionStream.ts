/**
 * useDecisionStream — SSE stream wrapper (U7d FD §3.2 + ultrathink I1: useRef callbacks).
 */
import { useCallback, useEffect, useRef } from "react";
import { ApiError } from "@yesman/api-client";
import type { DecisionRequestPayload } from "@yesman/api-client";
import { useApi } from "../../shell/ApiProvider";
import type { Utterance } from "./reducer";

export interface StreamCallbacks {
  onStart?: (decisionId: string) => void;
  // Post-CONSTRUCTION v3 (2026-05-23): persona pre-fill (bubble を delta 到着前から表示)
  onPersonasResolved?: (
    personas: { id: string; name: string }[],
  ) => void;
  // Post-CONSTRUCTION v3 (2026-05-23): token streaming chunk
  onUtteranceDelta?: (delta: {
    persona_id: string;
    persona_name: string;
    text: string;
  }) => void;
  onUtterance?: (utterance: Utterance) => void;
  onProposal?: (proposal: string) => void;
  onComplete?: () => void;
  onSilence?: (message: string) => void;
  onError?: (error: unknown) => void;
}

export function useDecisionStream(callbacks: StreamCallbacks) {
  const api = useApi();
  const abortRef = useRef<AbortController | null>(null);
  // ultrathink U7d FD I1: callbacks (毎 render 新 ref) を ref で capture
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const startStream = useCallback(
    async (payload: DecisionRequestPayload) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const stream = api.decisions.streamRequest(payload);
      try {
        for await (const event of stream.events(abortRef.current.signal)) {
          const cb = callbacksRef.current;
          switch (event.type) {
            case "start":
              cb.onStart?.(event.data.decision_id);
              break;
            case "personas":
              cb.onPersonasResolved?.(event.data.personas);
              break;
            case "utterance_delta":
              cb.onUtteranceDelta?.(event.data);
              break;
            case "utterance":
              cb.onUtterance?.({ ...event.data, done: true });
              break;
            case "proposal":
              cb.onProposal?.(event.data.proposal_text);
              break;
            case "complete":
              cb.onComplete?.();
              break;
            case "silence":
              cb.onSilence?.(event.data.text);
              break;
            case "error":
              cb.onError?.(event.data);
              break;
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.is("request_aborted")) return;
        callbacksRef.current.onError?.(err);
      }
    },
    [api],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // unmount 時に abort
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { startStream, abort };
}

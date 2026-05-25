import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";
import { DecisionStream } from "../sse";

// 2026-05-23 Drill-down chain: chain_context を optional 拡張
// 2026-05-24 v3-γ anonymous-strangers: persona_source を optional 拡張
// (OpenAPI 自動生成と同期するまでの手動)
export type DecisionRequestPayload =
  components["schemas"]["DecisionRequestDTO"] & {
    chain_context?: string[];
    persona_source?: "builtin" | "anonymous";
  };
export type DecisionResponse = components["schemas"]["DecisionResponse"];
export type ChoiceResponse = components["schemas"]["ChoiceResponse"];
export type NudgeResponse = components["schemas"]["NudgeResponse"];

export type DecisionHistoryItem = {
  id: string;
  user_input: string;
  proposal_text: string;
  user_choice: "yes" | "no" | "pending";
  attempt_count: number;
  created_at: string;
};

export type DecisionHistoryResponse = {
  items: DecisionHistoryItem[];
  limit: number;
};

export class DecisionsModule {
  constructor(private client: YesmanApiClient) {}

  async request(payload: DecisionRequestPayload): Promise<DecisionResponse> {
    return request<DecisionResponse>(this.client, "/v1/decisions/request", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  streamRequest(payload: DecisionRequestPayload): DecisionStream {
    return new DecisionStream(this.client, payload);
  }

  async choose(
    decisionId: string,
    choice: "yes" | "no",
  ): Promise<ChoiceResponse> {
    return request<ChoiceResponse>(
      this.client,
      `/v1/decisions/${decisionId}/choice`,
      {
        method: "POST",
        body: JSON.stringify({ choice }),
      },
    );
  }

  async getNudge(decisionId: string): Promise<NudgeResponse> {
    return request<NudgeResponse>(this.client, `/v1/decisions/${decisionId}/nudge`);
  }

  // issue #93: No 採択 → 新 proposal 到着後の YES nudge microcopy 同期取得
  async generateYesNudge(
    decisionId: string,
    payload: { stage: number },
  ): Promise<{ message: string }> {
    return request<{ message: string }>(
      this.client,
      `/v1/decisions/${decisionId}/yes-nudge`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  async history(opts?: {
    limit?: number;
    choice?: "yes" | "no" | "all";
  }): Promise<DecisionHistoryResponse> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.choice !== undefined) params.set("choice", opts.choice);
    const query = params.toString();
    return request<DecisionHistoryResponse>(
      this.client,
      `/v1/decisions${query ? `?${query}` : ""}`,
    );
  }
}

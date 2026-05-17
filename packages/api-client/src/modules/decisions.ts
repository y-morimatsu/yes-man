import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";
import { DecisionStream } from "../sse";

export type DecisionRequestPayload = components["schemas"]["DecisionRequestDTO"];
export type DecisionResponse = components["schemas"]["DecisionResponse"];
export type ChoiceResponse = components["schemas"]["ChoiceResponse"];
export type NudgeResponse = components["schemas"]["NudgeResponse"];

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
}

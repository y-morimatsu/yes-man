import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type Score = components["schemas"]["ScoreResponse"];

export class ScoresModule {
  constructor(private client: YesmanApiClient) {}

  async getMe(): Promise<Score> {
    return request<Score>(this.client, "/v1/scores/me");
  }
}

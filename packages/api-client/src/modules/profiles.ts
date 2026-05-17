import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type Profile = components["schemas"]["ProfileResponse"];
export type ProfileUpdate = components["schemas"]["ProfileUpdateRequest"];

export class ProfilesModule {
  constructor(private client: YesmanApiClient) {}

  async getMe(): Promise<Profile> {
    return request<Profile>(this.client, "/v1/profiles/me");
  }

  async updateMe(payload: ProfileUpdate): Promise<Profile> {
    return request<Profile>(this.client, "/v1/profiles/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteMe(): Promise<void> {
    return request<void>(this.client, "/v1/profiles/me", { method: "DELETE" });
  }
}

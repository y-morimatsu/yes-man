import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type PreferenceProfile = components["schemas"]["PreferenceProfileResponse"];
export type PreferenceProfileUpdate = components["schemas"]["PreferenceProfileUpdateRequest"];

export class PreferencesModule {
  constructor(private client: YesmanApiClient) {}

  async getMe(): Promise<PreferenceProfile> {
    return request<PreferenceProfile>(this.client, "/v1/preferences/me");
  }

  async updateMe(payload: PreferenceProfileUpdate): Promise<PreferenceProfile> {
    return request<PreferenceProfile>(this.client, "/v1/preferences/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async resetMe(): Promise<void> {
    return request<void>(this.client, "/v1/preferences/me", { method: "DELETE" });
  }
}

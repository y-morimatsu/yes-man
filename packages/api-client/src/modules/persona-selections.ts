import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type PersonaSelection = components["schemas"]["PersonaSelectionResponse"];
export type PersonaSelectionUpdate = components["schemas"]["PersonaSelectionUpdateRequest"];

export class PersonaSelectionsModule {
  constructor(private client: YesmanApiClient) {}

  async getMe(): Promise<PersonaSelection> {
    return request<PersonaSelection>(this.client, "/v1/persona-selections/me");
  }

  async setMe(payload: PersonaSelectionUpdate): Promise<PersonaSelection> {
    return request<PersonaSelection>(this.client, "/v1/persona-selections/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async resetMe(): Promise<void> {
    return request<void>(this.client, "/v1/persona-selections/me", {
      method: "DELETE",
    });
  }
}

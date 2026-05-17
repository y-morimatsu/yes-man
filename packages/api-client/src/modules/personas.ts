import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type Persona = components["schemas"]["PersonaResponse"];
export type SharedPersonaSummary = components["schemas"]["SharedPersonaSummaryResponse"];
export type PersonaCreate = components["schemas"]["PersonaCreateRequest"];
export type PersonaUpdate = components["schemas"]["PersonaUpdateRequest"];
export type PersonaShare = components["schemas"]["PersonaShareRequest"];
export type PersonaReport = components["schemas"]["PersonaReportRequest"];

export type SharedSort = "popularity" | "newest" | "acceptance";

export class PersonasModule {
  constructor(private client: YesmanApiClient) {}

  async listMy(): Promise<Persona[]> {
    return request<Persona[]>(this.client, "/v1/personas/me");
  }

  async listBuiltin(): Promise<Persona[]> {
    return request<Persona[]>(this.client, "/v1/personas/builtin");
  }

  async listShared(params: {
    page?: number;
    page_size?: number;
    sort?: SharedSort;
  } = {}): Promise<SharedPersonaSummary[]> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.page_size !== undefined) search.set("page_size", String(params.page_size));
    if (params.sort) search.set("sort", params.sort);
    const qs = search.toString();
    return request<SharedPersonaSummary[]>(
      this.client,
      `/v1/personas/shared${qs ? `?${qs}` : ""}`,
    );
  }

  async create(payload: PersonaCreate): Promise<Persona> {
    return request<Persona>(this.client, "/v1/personas/me", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async update(personaId: string, payload: PersonaUpdate): Promise<Persona> {
    return request<Persona>(this.client, `/v1/personas/${personaId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async delete(personaId: string): Promise<void> {
    return request<void>(this.client, `/v1/personas/${personaId}`, {
      method: "DELETE",
    });
  }

  async setShare(personaId: string, shared: boolean): Promise<Persona> {
    return request<Persona>(this.client, `/v1/personas/${personaId}/share`, {
      method: "PATCH",
      body: JSON.stringify({ shared } satisfies PersonaShare),
    });
  }

  async report(
    personaId: string,
    payload: PersonaReport,
  ): Promise<{ status: string; pending_reports: number }> {
    return request<{ status: string; pending_reports: number }>(
      this.client,
      `/v1/personas/${personaId}/report`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }
}

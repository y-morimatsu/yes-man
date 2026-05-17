import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import { YesmanApiClient } from "../../src/client";

const BASE = "http://localhost:8000";

describe("PersonasModule", () => {
  it("listMy GET /v1/personas/me", async () => {
    server.use(
      http.get(`${BASE}/v1/personas/me`, () =>
        HttpResponse.json([{ id: "p1", name: "test" }]),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const list = await client.personas.listMy();
    expect(Array.isArray(list)).toBe(true);
  });

  it("listBuiltin GET /v1/personas/builtin", async () => {
    server.use(
      http.get(`${BASE}/v1/personas/builtin`, () => HttpResponse.json([])),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await expect(client.personas.listBuiltin()).resolves.toEqual([]);
  });

  it("listShared GET /v1/personas/shared with query params", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/v1/personas/shared`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.personas.listShared({ page: 0, page_size: 20, sort: "newest" });
    expect(receivedUrl).toContain("page=0");
    expect(receivedUrl).toContain("page_size=20");
    expect(receivedUrl).toContain("sort=newest");
  });

  it("create POST /v1/personas/me with body", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/v1/personas/me`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.personas.create({
      name: "test",
      description: null,
      prompt_text: "x".repeat(40),
      avatar_url: null,
    });
    expect(receivedBody).toMatchObject({ name: "test" });
  });

  it("delete DELETE /v1/personas/:id returns void on 204", async () => {
    server.use(
      http.delete(`${BASE}/v1/personas/p1`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await expect(client.personas.delete("p1")).resolves.toBeUndefined();
  });

  it("setShare PATCH /v1/personas/:id/share", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/v1/personas/p1/share`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "p1", is_shared: true });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.personas.setShare("p1", true);
    expect(receivedBody).toEqual({ shared: true });
  });

  it("report POST /v1/personas/:id/report", async () => {
    server.use(
      http.post(`${BASE}/v1/personas/p1/report`, () =>
        HttpResponse.json({ status: "accepted", pending_reports: 1 }, { status: 201 }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const r = await client.personas.report("p1", {
      reason: "malicious",
      detail: "test",
    });
    expect(r.pending_reports).toBe(1);
  });
});

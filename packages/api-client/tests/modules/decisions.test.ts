import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import { YesmanApiClient } from "../../src/client";

const BASE = "http://localhost:8000";

describe("DecisionsModule", () => {
  it("request POST /v1/decisions/request", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/v1/decisions/request`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          decision_id: "d1",
          domain: "lunch",
          utterances: [],
          proposal_text: "ramen",
          nudge_url: "/v1/decisions/d1/nudge",
          no_attempt_count: 0,
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const resp = await client.decisions.request({ user_input: "lunch" });
    expect(receivedBody).toEqual({ user_input: "lunch" });
    expect(resp.decision_id).toBe("d1");
  });

  it("choose POST /v1/decisions/:id/choice", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/v1/decisions/d1/choice`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          decision_id: "d1",
          nudge_url: "/v1/decisions/d1/nudge",
          no_attempt_count: 1,
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.decisions.choose("d1", "yes");
    expect(receivedBody).toEqual({ choice: "yes" });
  });

  it("getNudge GET /v1/decisions/:id/nudge", async () => {
    server.use(
      http.get(`${BASE}/v1/decisions/d1/nudge`, () =>
        HttpResponse.json({ status: "ready", message: "good!" }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const r = await client.decisions.getNudge("d1");
    expect(r.status).toBe("ready");
  });

  it("streamRequest returns DecisionStream instance", () => {
    const client = new YesmanApiClient({ baseUrl: BASE });
    const stream = client.decisions.streamRequest({ user_input: "x" });
    expect(stream).toBeDefined();
    expect(typeof stream.events).toBe("function");
  });
});

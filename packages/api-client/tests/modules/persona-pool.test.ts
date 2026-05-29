import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import { YesmanApiClient } from "../../src/client";
import { ApiError } from "../../src/errors";
import { isInsufficientSignalsError } from "../../src/modules/persona-pool";

const BASE = "http://localhost:8000";

describe("PersonaPoolModule (v3-γ anonymous-strangers)", () => {
  // ============================================================
  // GET /v1/persona-pool/me
  // ============================================================
  it("getStatus returns opt-in state + preview + guard", async () => {
    server.use(
      http.get(`${BASE}/v1/persona-pool/me`, () =>
        HttpResponse.json({
          opted_in: false,
          preview: {
            persona_id: "aaaa-bbbb",
            value_tags: ["慎重派", "夜型"],
            primary_language: "ja",
            formality: "casual",
          },
          guard: { signal_total: 4, min_required: 3, is_eligible: true },
        }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const status = await client.personaPool.getStatus();
    expect(status.opted_in).toBe(false);
    expect(status.preview?.primary_language).toBe("ja");
    expect(status.guard.is_eligible).toBe(true);
  });

  it("getStatus returns guard.is_eligible=false when preference is empty", async () => {
    server.use(
      http.get(`${BASE}/v1/persona-pool/me`, () =>
        HttpResponse.json({
          opted_in: false,
          preview: null,
          guard: { signal_total: 0, min_required: 3, is_eligible: false },
        }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const status = await client.personaPool.getStatus();
    expect(status.preview).toBeNull();
    expect(status.guard.is_eligible).toBe(false);
  });

  // ============================================================
  // POST /v1/persona-pool/opt-in
  // ============================================================
  it("optIn returns AnonymousPersona on success", async () => {
    server.use(
      http.post(`${BASE}/v1/persona-pool/opt-in`, () =>
        HttpResponse.json({
          persona_id: "uuid-self",
          value_tags: ["t1", "t2", "t3"],
          primary_language: "ja",
          formality: "polite",
        }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const spec = await client.personaPool.optIn();
    expect(spec.persona_id).toBe("uuid-self");
    expect(spec.value_tags).toEqual(["t1", "t2", "t3"]);
  });

  it("optIn throws ApiError 422 with InsufficientSignalsDetail when guard fails", async () => {
    server.use(
      http.post(`${BASE}/v1/persona-pool/opt-in`, () =>
        HttpResponse.json(
          {
            detail: {
              code: "insufficient_profile_signals",
              signal_total: 1,
              min_required: 3,
              hint: "嗜好把握が足りないので公開できません。何回か決定を試してみてください",
            },
          },
          { status: 422 },
        ),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await expect(client.personaPool.optIn()).rejects.toBeInstanceOf(ApiError);
  });

  // ============================================================
  // DELETE /v1/persona-pool/opt-in
  // ============================================================
  it("optOut returns void on 204", async () => {
    server.use(
      http.delete(`${BASE}/v1/persona-pool/opt-in`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const result = await client.personaPool.optOut();
    expect(result).toBeUndefined();
  });

  it("optOut is idempotent (204 even when not opted-in)", async () => {
    server.use(
      http.delete(`${BASE}/v1/persona-pool/opt-in`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.personaPool.optOut();
    await client.personaPool.optOut(); // second call also succeeds
  });

  // ============================================================
  // GET /v1/persona-pool/random
  // ============================================================
  // GET /v1/persona-pool/list (2026-05-24 v4 — random は撤去、selection UI 用 list へ移行)
  // ============================================================
  it("list fetches 20 personas by default (NFR-6: exclude=self is server-side)", async () => {
    let receivedLimit: string | null = null;
    server.use(
      http.get(`${BASE}/v1/persona-pool/list`, ({ request }) => {
        const url = new URL(request.url);
        receivedLimit = url.searchParams.get("limit");
        expect(url.searchParams.has("exclude")).toBe(false);
        return HttpResponse.json({
          personas: [
            {
              persona_id: "p1",
              value_tags: ["t"],
              primary_language: "en",
              formality: "casual",
            },
          ],
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const resp = await client.personaPool.list();
    expect(receivedLimit).toBe("20");
    expect(resp.personas).toHaveLength(1);
  });

  it("list honors custom limit parameter", async () => {
    let receivedLimit: string | null = null;
    server.use(
      http.get(`${BASE}/v1/persona-pool/list`, ({ request }) => {
        receivedLimit = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json({ personas: [] });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.personaPool.list(50);
    expect(receivedLimit).toBe("50");
  });

  // ============================================================
  // GET /v1/persona-pool/me/citations
  // ============================================================
  it("myCitations returns today_count and all_time_count", async () => {
    server.use(
      http.get(`${BASE}/v1/persona-pool/me/citations`, () =>
        HttpResponse.json({ today_count: 5, all_time_count: 12 }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const c = await client.personaPool.myCitations();
    expect(c.today_count).toBe(5);
    expect(c.all_time_count).toBe(12);
  });

  // ============================================================
  // GET /v1/persona-pool/cited-by-me
  // ============================================================
  it("citedByMe returns history items with optional persona", async () => {
    server.use(
      http.get(`${BASE}/v1/persona-pool/cited-by-me`, () =>
        HttpResponse.json({
          items: [
            {
              cited_persona_id: "p-fr",
              cited_at: "2026-05-23T10:00:00Z",
              persona: {
                persona_id: "p-fr",
                value_tags: ["和食派"],
                primary_language: "fr",
                formality: "polite",
              },
            },
            {
              cited_persona_id: "p-vanished",
              cited_at: "2026-05-22T08:00:00Z",
              persona: null, // spec が pool から消えた case
            },
          ],
        }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const h = await client.personaPool.citedByMe();
    expect(h.items).toHaveLength(2);
    expect(h.items[0]!.persona?.primary_language).toBe("fr");
    expect(h.items[1]!.persona).toBeNull();
  });
});

describe("isInsufficientSignalsError type guard (I-2 fix)", () => {
  it("returns true for ApiError 422 with insufficient_profile_signals detail", async () => {
    server.use(
      http.post(`${BASE}/v1/persona-pool/opt-in`, () =>
        HttpResponse.json(
          {
            detail: {
              code: "insufficient_profile_signals",
              signal_total: 0,
              min_required: 3,
              hint: "嗜好把握が足りないので公開できません",
            },
          },
          { status: 422 },
        ),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    try {
      await client.personaPool.optIn();
      throw new Error("should have thrown");
    } catch (err) {
      expect(isInsufficientSignalsError(err)).toBe(true);
      if (isInsufficientSignalsError(err)) {
        // type narrowed → caller が type-safe にアクセス可能
        // ApiError.detail = body.detail を保持する (errors.ts ApiError.from の挙動)
        expect(err.detail.code).toBe("insufficient_profile_signals");
        expect(err.detail.signal_total).toBe(0);
        expect(err.detail.min_required).toBe(3);
        expect(err.detail.hint).toContain("嗜好把握");
      }
    }
  });

  it("returns false for ApiError 422 with different code", () => {
    const err = new ApiError(
      422,
      "validation_error",
      { code: "other_error" },
      null,
    );
    expect(isInsufficientSignalsError(err)).toBe(false);
  });

  it("returns false for ApiError with non-422 status", () => {
    const err = new ApiError(
      500,
      "internal_error",
      { code: "insufficient_profile_signals" },
      null,
    );
    expect(isInsufficientSignalsError(err)).toBe(false);
  });

  it("returns false for non-ApiError values", () => {
    expect(isInsufficientSignalsError(new Error("plain"))).toBe(false);
    expect(isInsufficientSignalsError(null)).toBe(false);
    expect(isInsufficientSignalsError(undefined)).toBe(false);
    expect(isInsufficientSignalsError({ status: 422 })).toBe(false);
  });

  it("returns false for ApiError 422 without detail body", () => {
    const err = new ApiError(422, "validation_error", null, null);
    expect(isInsufficientSignalsError(err)).toBe(false);
  });
});

describe("DecisionRequestPayload extension (v3-γ persona_source)", () => {
  it("accepts persona_source='anonymous' in decision request body", async () => {
    let receivedBody: any = null;
    server.use(
      http.post(`${BASE}/v1/decisions/request`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          decision_id: "d-anon",
          domain: "daily",
          utterances: [],
          proposal_text: "そうしよう",
          nudge_url: "/v1/decisions/d-anon/nudge",
          no_attempt_count: 0,
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.decisions.request({
      user_input: "lunch",
      persona_source: "anonymous",
    });
    expect(receivedBody.persona_source).toBe("anonymous");
  });
});

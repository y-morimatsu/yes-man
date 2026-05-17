import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors";

describe("ApiError.from", () => {
  it("extracts reason from custom 422 (Persona error)", async () => {
    const resp = new Response(
      JSON.stringify({ detail: { reason: "rejected_by_moderator", domain: "religion" } }),
      { status: 422 },
    );
    const err = await ApiError.from(resp);
    expect(err.status).toBe(422);
    expect(err.reason).toBe("rejected_by_moderator");
  });

  it("maps Pydantic 422 (list detail) to validation_error", async () => {
    const resp = new Response(
      JSON.stringify({ detail: [{ loc: ["body", "text"], msg: "max_length", type: "..." }] }),
      { status: 422 },
    );
    const err = await ApiError.from(resp);
    expect(err.reason).toBe("validation_error");
  });

  it("maps 401 to unauthorized", async () => {
    const resp = new Response(JSON.stringify({ detail: "missing token" }), { status: 401 });
    const err = await ApiError.from(resp);
    expect(err.reason).toBe("unauthorized");
  });

  it("maps 403 to forbidden", async () => {
    const resp = new Response(JSON.stringify({ detail: "no access" }), { status: 403 });
    const err = await ApiError.from(resp);
    expect(err.reason).toBe("forbidden");
  });

  it("maps 500 to internal_error", async () => {
    const resp = new Response(JSON.stringify({ detail: "boom" }), { status: 500 });
    const err = await ApiError.from(resp);
    expect(err.reason).toBe("internal_error");
  });

  it("handles malformed JSON gracefully", async () => {
    const resp = new Response("not-json", { status: 500 });
    const err = await ApiError.from(resp);
    expect(err.reason).toBe("internal_error");
  });

  it("is() matches known reason", async () => {
    const resp = new Response(
      JSON.stringify({ detail: { reason: "tts_silenced_domain" } }),
      { status: 422 },
    );
    const err = await ApiError.from(resp);
    expect(err.is("tts_silenced_domain")).toBe(true);
    expect(err.is("network_error")).toBe(false);
  });

  it("supports null response (network error)", () => {
    const err = new ApiError(0, "network_error", { message: "fail" }, null);
    expect(err.response).toBeNull();
    expect(err.reason).toBe("network_error");
  });
});

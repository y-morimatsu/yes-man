import { describe, expect, it } from "vitest";
import { ApiError } from "@yesman/api-client";
import { describeError } from "../../../src/features/decision/describeError";

describe("describeError", () => {
  it("returns ApiError.reason with detail.message", () => {
    const err = new ApiError(
      500,
      "llm_unavailable",
      { message: "Claude CLI subprocess timeout" },
      null,
    );
    expect(describeError(err)).toBe("llm_unavailable: Claude CLI subprocess timeout");
  });

  it("returns ApiError.reason alone when no detail.message", () => {
    const err = new ApiError(500, "internal_error", {}, null);
    expect(describeError(err)).toBe("internal_error");
  });

  it("returns Error.message for plain Error", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("returns the string unchanged for string errors", () => {
    expect(describeError("network down")).toBe("network down");
  });

  it("extracts reason+detail.message from SSE error event payload", () => {
    // useDecisionStream で event.data = {reason, detail} がそのまま渡されるケース
    const payload = { reason: "llm_unavailable", detail: { message: "503 from Bedrock" } };
    expect(describeError(payload)).toBe("llm_unavailable: 503 from Bedrock");
  });

  it("extracts reason alone from SSE event without detail.message", () => {
    expect(describeError({ reason: "silenced_domain" })).toBe("silenced_domain");
  });

  it("falls back to message field for generic objects", () => {
    expect(describeError({ message: "raw error" })).toBe("raw error");
  });

  it("falls back to JSON.stringify for unrecognized objects", () => {
    expect(describeError({ foo: 1, bar: "x" })).toBe('{"foo":1,"bar":"x"}');
  });

  it("handles non-object primitives", () => {
    expect(describeError(42)).toBe("42");
    expect(describeError(null)).toBe("null");
  });
});

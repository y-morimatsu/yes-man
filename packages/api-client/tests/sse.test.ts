import { describe, expect, it } from "vitest";
import { parseSseChunk } from "../src/sse";

describe("parseSseChunk", () => {
  it("parses single-line data event", () => {
    const chunk = `event: start\ndata: {"decision_id":"abc"}`;
    const event = parseSseChunk(chunk);
    expect(event).toEqual({ type: "start", data: { decision_id: "abc" } });
  });

  it("joins multi-line data with newline (W3C SSE spec)", () => {
    const chunk = `event: utterance\ndata: {"persona_id":"p1",\ndata: "persona_name":"A","text":"hello"}`;
    const event = parseSseChunk(chunk);
    expect(event?.type).toBe("utterance");
    expect((event?.data as { persona_id: string }).persona_id).toBe("p1");
  });

  it("returns null on missing event", () => {
    const chunk = `data: {"x":1}`;
    expect(parseSseChunk(chunk)).toBeNull();
  });

  it("returns null on missing data", () => {
    const chunk = `event: start`;
    expect(parseSseChunk(chunk)).toBeNull();
  });

  it("returns null on malformed JSON data", () => {
    const chunk = `event: start\ndata: not-json`;
    expect(parseSseChunk(chunk)).toBeNull();
  });

  it("trims event name whitespace", () => {
    const chunk = `event:   complete  \ndata: {"decision_id":"x"}`;
    const event = parseSseChunk(chunk);
    expect(event?.type).toBe("complete");
  });
});

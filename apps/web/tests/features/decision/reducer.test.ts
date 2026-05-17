import { describe, expect, it } from "vitest";
import {
  decisionReducer,
  initialState,
  type DecisionState,
  type Utterance,
} from "../../../src/features/decision/reducer";

const u: Utterance = { persona_id: "p1", persona_name: "慎重派", text: "..." };

describe("decisionReducer", () => {
  it("setInput while idle updates input", () => {
    const next = decisionReducer(initialState, { type: "setInput", input: "lunch" });
    expect(next).toEqual({ status: "idle", input: "lunch" });
  });

  it("start transitions idle → streaming", () => {
    const next = decisionReducer(
      { status: "idle", input: "lunch" },
      { type: "start" },
    );
    expect(next.status).toBe("streaming");
    expect((next as Extract<DecisionState, { status: "streaming" }>).input).toBe("lunch");
  });

  it("onStart sets decisionId on streaming", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: null,
      utterances: [],
      proposal: null,
    };
    const next = decisionReducer(streaming, { type: "onStart", decisionId: "d1" });
    expect((next as Extract<DecisionState, { status: "streaming" }>).decisionId).toBe("d1");
  });

  it("onUtterance appends to utterances array", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: "d1",
      utterances: [],
      proposal: null,
    };
    const next = decisionReducer(streaming, { type: "onUtterance", utterance: u });
    expect((next as Extract<DecisionState, { status: "streaming" }>).utterances).toHaveLength(1);
  });

  it("onComplete transitions streaming → completed", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: "d1",
      utterances: [u],
      proposal: "吉野家",
    };
    const next = decisionReducer(streaming, { type: "onComplete" });
    expect(next.status).toBe("completed");
  });

  it("onComplete stays streaming if decisionId or proposal missing", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: null,
      utterances: [],
      proposal: null,
    };
    const next = decisionReducer(streaming, { type: "onComplete" });
    expect(next.status).toBe("streaming");
  });

  it("onError transitions to error", () => {
    const next = decisionReducer(
      { status: "idle", input: "x" },
      { type: "onError", error: "boom" },
    );
    expect(next.status).toBe("error");
  });

  it("reset returns to initial idle", () => {
    const completed: DecisionState = {
      status: "completed",
      decisionId: "d1",
      input: "x",
      utterances: [],
      proposal: "y",
    };
    const next = decisionReducer(completed, { type: "reset" });
    expect(next).toEqual({ status: "idle", input: "" });
  });

  it("setInput while streaming is ignored", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: "d1",
      utterances: [],
      proposal: null,
    };
    const next = decisionReducer(streaming, { type: "setInput", input: "dinner" });
    expect(next).toBe(streaming);
  });
});

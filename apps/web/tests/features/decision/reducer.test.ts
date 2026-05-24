import { describe, expect, it } from "vitest";
import {
  decisionReducer,
  initialState,
  type DecisionState,
  type Utterance,
} from "../../../src/features/decision/reducer";

const u: Utterance = { persona_id: "p1", persona_name: "慎重派", text: "...", done: true };

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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
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
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
    };
    const next = decisionReducer(streaming, { type: "setInput", input: "dinner" });
    expect(next).toBe(streaming);
  });

  // Post-CONSTRUCTION v3 (2026-05-23): personas pre-fill.
  describe("onPersonasResolved (pre-fill bubbles)", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: "d1",
      utterances: [],
      proposal: null,
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
    };

    it("pre-fills empty utterances with done=false", () => {
      const next = decisionReducer(streaming, {
        type: "onPersonasResolved",
        personas: [
          { id: "p1", name: "慎重派" },
          { id: "p2", name: "楽観派" },
          { id: "p3", name: "効率派" },
        ],
      });
      const utterances = (
        next as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(3);
      expect(utterances.every((u) => u.text === "" && u.done === false)).toBe(
        true,
      );
      expect(utterances.map((u) => u.persona_name)).toEqual([
        "慎重派",
        "楽観派",
        "効率派",
      ]);
    });

    it("skips personas that already exist (idempotent re-emit)", () => {
      const after1 = decisionReducer(streaming, {
        type: "onPersonasResolved",
        personas: [{ id: "p1", name: "慎重派" }],
      });
      // 同 id を含む personas event が再 emit されても duplicate しない
      const after2 = decisionReducer(after1, {
        type: "onPersonasResolved",
        personas: [
          { id: "p1", name: "慎重派" },
          { id: "p2", name: "楽観派" },
        ],
      });
      const utterances = (
        after2 as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(2);
      expect(utterances.map((u) => u.persona_id)).toEqual(["p1", "p2"]);
    });

    it("subsequent delta fills text of pre-filled entry", () => {
      const afterPersonas = decisionReducer(streaming, {
        type: "onPersonasResolved",
        personas: [{ id: "p1", name: "慎重派" }],
      });
      const afterDelta = decisionReducer(afterPersonas, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "今日は",
      });
      const utterances = (
        afterDelta as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(1);
      expect(utterances[0]!.text).toBe("今日は");
      expect(utterances[0]!.done).toBe(false);
    });

    it("ignored when not streaming", () => {
      const idle: DecisionState = { status: "idle", input: "x" };
      const next = decisionReducer(idle, {
        type: "onPersonasResolved",
        personas: [{ id: "p1", name: "慎重派" }],
      });
      expect(next).toBe(idle);
    });
  });

  // Post-CONSTRUCTION v3 (2026-05-23): token streaming.
  describe("onUtteranceDelta (token streaming)", () => {
    const streaming: DecisionState = {
      status: "streaming",
      input: "lunch",
      decisionId: "d1",
      utterances: [],
      proposal: null,
      isFinal: false,
      depth: 0,
      service: null,
      lastSpeakerId: null,
    };

    it("first delta inserts new utterance with done=false", () => {
      const next = decisionReducer(streaming, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "今",
      });
      const utterances = (
        next as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(1);
      expect(utterances[0]).toEqual({
        persona_id: "p1",
        persona_name: "慎重派",
        text: "今",
        done: false,
      });
    });

    it("subsequent deltas append to existing utterance text", () => {
      const after1 = decisionReducer(streaming, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "今",
      });
      const after2 = decisionReducer(after1, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "日は",
      });
      const utterances = (
        after2 as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(1);
      expect(utterances[0]!.text).toBe("今日は");
      expect(utterances[0]!.done).toBe(false);
    });

    it("final onUtterance replaces streaming entry and sets done=true", () => {
      const afterDelta = decisionReducer(streaming, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "今日は寒い",
      });
      const afterFinal = decisionReducer(afterDelta, {
        type: "onUtterance",
        utterance: {
          persona_id: "p1",
          persona_name: "慎重派",
          text: "今日は寒いですね",
          done: true,
        },
      });
      const utterances = (
        afterFinal as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(1);
      expect(utterances[0]!.text).toBe("今日は寒いですね");
      expect(utterances[0]!.done).toBe(true);
    });

    it("deltas for different personas create separate entries", () => {
      const a = decisionReducer(streaming, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "AA",
      });
      const b = decisionReducer(a, {
        type: "onUtteranceDelta",
        personaId: "p2",
        personaName: "楽観派",
        chunk: "BB",
      });
      const utterances = (
        b as Extract<DecisionState, { status: "streaming" }>
      ).utterances;
      expect(utterances).toHaveLength(2);
      expect(utterances.map((u) => u.persona_id).sort()).toEqual(["p1", "p2"]);
    });

    it("delta ignored when not streaming (idempotent)", () => {
      const idle: DecisionState = { status: "idle", input: "x" };
      const next = decisionReducer(idle, {
        type: "onUtteranceDelta",
        personaId: "p1",
        personaName: "慎重派",
        chunk: "hi",
      });
      expect(next).toBe(idle);
    });
  });
});

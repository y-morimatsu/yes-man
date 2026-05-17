/**
 * PBT: decisionReducer invariants (U-Test FD §4.2).
 *
 * 不変条件:
 * - state.status は 4 値のいずれか (discriminated union)
 * - input 文字列の長さは action 経由でのみ変化
 * - reset action は status を idle に戻し input を空に
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { decisionReducer, initialState } from "../../src/features/decision/reducer";
import type { DecisionAction, DecisionState } from "../../src/features/decision/reducer";

const validStatuses = ["idle", "streaming", "completed", "error"] as const;

describe("decisionReducer PBT invariants", () => {
  it("status is always one of 4 valid values", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<DecisionAction>(
          { type: "setInput", input: "x" },
          { type: "start" },
          { type: "onStart", decisionId: "d1" },
          { type: "onUtterance", utterance: { persona_id: "p", persona_name: "n", text: "t" } },
          { type: "onProposal", proposal: "p" },
          { type: "onComplete" },
          { type: "onError", error: "e" },
          { type: "reset" },
        ), { maxLength: 50 }),
        (actions) => {
          let state: DecisionState = initialState;
          for (const action of actions) {
            state = decisionReducer(state, action);
            expect(validStatuses).toContain(state.status);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reset always returns to idle with empty input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<DecisionAction>(
          { type: "setInput", input: "x" },
          { type: "start" },
          { type: "onError", error: "e" },
          { type: "reset" },
        ), { maxLength: 20 }),
        (actions) => {
          let state: DecisionState = initialState;
          for (const action of actions) {
            state = decisionReducer(state, action);
          }
          // reset を最後に適用すれば必ず idle に戻る
          const final = decisionReducer(state, { type: "reset" });
          expect(final).toEqual({ status: "idle", input: "" });
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * reducer.ts — DecisionPage の state machine (pure function、test 容易).
 *
 * ultrathink U7d FD Imp1: useReducer + discriminated union state machine.
 * ultrathink U7d NFR Design I2: `_exhaustive: never` で compile-time exhaustive check.
 */

// Utterance 型 (api-client Type-only import 想定、依存 cycle 回避で local 定義)
export interface Utterance {
  persona_id: string;
  persona_name: string;
  text: string;
}

export type DecisionState =
  | { status: "idle"; input: string }
  | {
      status: "streaming";
      input: string;
      decisionId: string | null;
      utterances: Utterance[];
      proposal: string | null;
    }
  | {
      status: "completed";
      decisionId: string;
      input: string;
      utterances: Utterance[];
      proposal: string;
    }
  // INCEPTION D Silence Theater: 沈黙ドメイン検知時の専用 state
  | { status: "silenced"; input: string; message: string }
  | { status: "error"; error: string; input: string };

export type DecisionAction =
  | { type: "setInput"; input: string }
  | { type: "start" }
  | { type: "onStart"; decisionId: string }
  | { type: "onUtterance"; utterance: Utterance }
  | { type: "onProposal"; proposal: string }
  | { type: "onComplete" }
  | { type: "onSilence"; message: string }
  | { type: "onError"; error: string }
  | { type: "reset" }
  // 事前 prefetch した別案で即時 swap (loading 演出なし、completed に直接遷移)
  | {
      type: "swapFromBuffer";
      decisionId: string;
      utterances: Utterance[];
      proposal: string;
    };

export const initialState: DecisionState = { status: "idle", input: "" };

export function decisionReducer(
  state: DecisionState,
  action: DecisionAction,
): DecisionState {
  switch (action.type) {
    case "setInput":
      if (state.status === "streaming" || state.status === "completed") return state;
      return { ...state, status: "idle", input: action.input };

    case "start":
      if (state.status === "streaming") return state;
      return {
        status: "streaming",
        input: state.input,
        decisionId: null,
        utterances: [],
        proposal: null,
      };

    case "onStart":
      if (state.status !== "streaming") return state;
      return { ...state, decisionId: action.decisionId };

    case "onUtterance":
      if (state.status !== "streaming") return state;
      return { ...state, utterances: [...state.utterances, action.utterance] };

    case "onProposal":
      if (state.status !== "streaming") return state;
      return { ...state, proposal: action.proposal };

    case "onComplete":
      if (state.status !== "streaming" || !state.decisionId || !state.proposal) {
        return state;
      }
      return {
        status: "completed",
        decisionId: state.decisionId,
        input: state.input,
        utterances: state.utterances,
        proposal: state.proposal,
      };

    case "onSilence":
      return {
        status: "silenced",
        input: "input" in state ? state.input : "",
        message: action.message,
      };

    case "onError":
      return { status: "error", error: action.error, input: "" };

    case "reset":
      return { status: "idle", input: "" };

    case "swapFromBuffer": {
      // No 採択後の prefetch 済み別案で即時 swap.
      // 直前の状態が completed (proposal 表示中) であることが前提だが、
      // 念のため input を残しつつ completed に強制遷移する.
      const input = "input" in state ? state.input : "";
      return {
        status: "completed",
        decisionId: action.decisionId,
        input,
        utterances: action.utterances,
        proposal: action.proposal,
      };
    }

    default: {
      // ultrathink U7d NFR Design I2: exhaustive check
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

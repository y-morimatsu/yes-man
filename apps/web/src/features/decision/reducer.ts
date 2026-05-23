/**
 * reducer.ts — DecisionPage の state machine (pure function、test 容易).
 *
 * ultrathink U7d FD Imp1: useReducer + discriminated union state machine.
 * ultrathink U7d NFR Design I2: `_exhaustive: never` で compile-time exhaustive check.
 */

// Utterance 型 (api-client Type-only import 想定、依存 cycle 回避で local 定義)
// Post-CONSTRUCTION v3 (2026-05-23): `done` で streaming 中 vs 確定済を区別。
// false = utterance_delta accumulate 中 / true = 最終 utterance event 到着済。
export interface Utterance {
  persona_id: string;
  persona_name: string;
  text: string;
  done: boolean;
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
  // Post-CONSTRUCTION v3 (2026-05-23): personas pre-fill - bubble を delta 到着前から表示
  | {
      type: "onPersonasResolved";
      personas: { id: string; name: string }[];
    }
  // Post-CONSTRUCTION v3 (2026-05-23): token streaming chunk
  | {
      type: "onUtteranceDelta";
      personaId: string;
      personaName: string;
      chunk: string;
    }
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
      // 同じ input 値なら state 維持で re-render 抑制 (Voice の transcript 再通知時の防御)
      if (state.status === "idle" && state.input === action.input) return state;
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

    case "onPersonasResolved": {
      // Post-CONSTRUCTION v3 (2026-05-23): 既存 entry にない persona を text="" / done=false で
      // pre-fill する。delta 到着前から bubble header (icon + name) を可視化。
      if (state.status !== "streaming") return state;
      const existing = new Set(state.utterances.map((u) => u.persona_id));
      const newEntries: Utterance[] = action.personas
        .filter((p) => !existing.has(p.id))
        .map((p) => ({
          persona_id: p.id,
          persona_name: p.name,
          text: "",
          done: false,
        }));
      if (newEntries.length === 0) return state;
      return { ...state, utterances: [...state.utterances, ...newEntries] };
    }

    case "onUtteranceDelta": {
      // Post-CONSTRUCTION v3: 既存 persona に append、無ければ insert (done=false)。
      if (state.status !== "streaming") return state;
      const existingIdx = state.utterances.findIndex(
        (u) => u.persona_id === action.personaId,
      );
      if (existingIdx === -1) {
        return {
          ...state,
          utterances: [
            ...state.utterances,
            {
              persona_id: action.personaId,
              persona_name: action.personaName,
              text: action.chunk,
              done: false,
            },
          ],
        };
      }
      const current = state.utterances[existingIdx]!;
      const updated = state.utterances.slice();
      updated[existingIdx] = { ...current, text: current.text + action.chunk };
      return { ...state, utterances: updated };
    }

    case "onUtterance": {
      // Post-CONSTRUCTION v3: 既存 streaming entry を最終 cleaned text で確定 (done=true)。
      // delta 受信前に utterance が来た場合 (fast path) は新規 push。
      if (state.status !== "streaming") return state;
      const finalU: Utterance = { ...action.utterance, done: true };
      const existingIdx = state.utterances.findIndex(
        (u) => u.persona_id === finalU.persona_id,
      );
      if (existingIdx === -1) {
        return { ...state, utterances: [...state.utterances, finalU] };
      }
      const updated = state.utterances.slice();
      updated[existingIdx] = finalU;
      return { ...state, utterances: updated };
    }

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

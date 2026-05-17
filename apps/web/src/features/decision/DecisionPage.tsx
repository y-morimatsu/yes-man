/**
 * DecisionPage — main page (U7d FD §3.1 + ultrathink Imp1: useReducer state machine).
 *
 * INCEPTION Journey C (drawio 04_NoBurst): No 採択 → 自動再生成 + 段階的 microcopy.
 * - useReducer の "start" は idle→streaming + completed→streaming (regenerate) 両方対応
 * - noStage state (DecisionPage scope) で No 連続採択の累積回数を保持
 * - 別案 streaming 中も NoMicroCopyBanner は持続、Yes 採択時のみ hide
 */
import { useReducer, useRef, useState } from "react";
import { Button, Input } from "@yesman/ui";
import { VoiceMicInput } from "../voice/VoiceMicInput";
import { decisionReducer, initialState } from "./reducer";
import { useDecisionStream } from "./useDecisionStream";
import { DecisionResult } from "./DecisionResult";
import { NoMicroCopyBanner } from "./NoMicroCopyBanner";
import { t } from "./strings";

export default function DecisionPage() {
  const [state, dispatch] = useReducer(decisionReducer, initialState);
  // INCEPTION Journey C: No 連打の累積 stage (0=未No、1〜=段階的 microcopy).
  // reducer 外で保持し、regenerate を跨いで持続させる.
  const [noStage, setNoStage] = useState<number>(0);
  // 別案再生成中フラグ (Yes 採択後にも残らないよう reset で 0 に戻す).
  const [regenerating, setRegenerating] = useState(false);
  // 最後に submit した user_input を保持 (regenerate で再利用、reducer state 透過には依存しない).
  const lastInputRef = useRef<string>("");

  const { startStream } = useDecisionStream({
    onStart: (id) => dispatch({ type: "onStart", decisionId: id }),
    onUtterance: (u) => dispatch({ type: "onUtterance", utterance: u }),
    onProposal: (text) => dispatch({ type: "onProposal", proposal: text }),
    onComplete: () => {
      dispatch({ type: "onComplete" });
      setRegenerating(false);
    },
    onSilence: (message) => dispatch({ type: "onSilence", message }),
    onError: (err) => {
      dispatch({ type: "onError", error: String(err) });
      setRegenerating(false);
    },
  });

  const handleStart = async () => {
    if (state.status === "streaming") return;
    if (state.status === "completed") return;
    if (!("input" in state) || !state.input) return;
    lastInputRef.current = state.input;
    setNoStage(0); // 新規 submit は No carry-forward を reset
    setRegenerating(false);
    dispatch({ type: "start" });
    await startStream({ user_input: state.input });
  };

  /** INCEPTION Journey C: No 採択 → 自動再生成 + 段階的 microcopy.
   *  DecisionResult からの callback、no_attempt_count を受けて新 stream を発火. */
  const handleNoChosen = async (count: number) => {
    const input = lastInputRef.current;
    if (!input) return;
    setNoStage(count);
    setRegenerating(true);
    // dispatch("start") は state.status==="streaming" でガード入るが、
    // 採択時点は completed → streaming へ遷移可能.
    dispatch({ type: "start" });
    await startStream({ user_input: input });
  };

  /** 完全 reset (Yes 採択後の もう一度 / silenced からの Home / error からのやり直し). */
  const handleFullReset = () => {
    setNoStage(0);
    setRegenerating(false);
    lastInputRef.current = "";
    dispatch({ type: "reset" });
  };

  const showInput = state.status === "idle" || state.status === "error";
  const inputValue =
    state.status === "idle" || state.status === "error" || state.status === "streaming"
      ? state.input
      : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>

      {showInput && (
        <>
          <Input
            value={inputValue}
            onChange={(e) => dispatch({ type: "setInput", input: e.target.value })}
            placeholder={t("inputPlaceholder")}
          />
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleStart}
              disabled={!inputValue}
            >
              {t("startButton")}
            </Button>
            <VoiceMicInput
              onTranscript={(text) => dispatch({ type: "setInput", input: text })}
            />
          </div>
        </>
      )}

      {state.status === "streaming" && (
        <p className="text-neutral-600">{t("streamingHint")}</p>
      )}

      {/* INCEPTION Journey C: No 連打 microcopy banner (regenerate を跨いで持続) */}
      {noStage > 0 &&
        (state.status === "streaming" || state.status === "completed") && (
          <NoMicroCopyBanner stage={noStage} regenerating={regenerating} />
        )}

      {(state.status === "streaming" || state.status === "completed") && (
        <DecisionResult
          utterances={state.utterances}
          proposal={state.status === "completed" ? state.proposal : state.proposal}
          decisionId={state.status === "completed" ? state.decisionId : null}
          onComplete={handleFullReset}
          onNoChosen={handleNoChosen}
        />
      )}

      {/* INCEPTION D Silence Theater: 沈黙ドメイン (宗教/選挙/暴力/卑猥) 検出時 */}
      {state.status === "silenced" && (
        <div
          className="rounded-2xl bg-neutral-100 p-8 text-center"
          role="region"
          aria-label="沈黙演出"
        >
          <p className="text-5xl font-serif text-silence mb-4" aria-hidden>
            …
          </p>
          <p className="text-sm text-neutral-700 italic mb-1">
            （沈黙）
          </p>
          <p className="text-sm text-neutral-700">
            この領域は AI が 代行しません
          </p>
          <p className="mt-4 text-xs text-neutral-400 italic">
            宗教 / 選挙 / 暴力 / 卑猥 ＝ ご自身で 判断する 領域
          </p>
          {state.message && (
            <p className="mt-3 text-sm text-neutral-700 whitespace-pre-wrap">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={handleFullReset}
            className="mt-6 text-xs italic text-neutral-500 underline"
          >
            タップで Home へ もどる
          </button>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-danger" role="alert">
          {t("errorDefault")}: {state.error}
        </p>
      )}

      {/* INCEPTION screen-01 bottom hint (whisper copy、決定の重さを優しく問いかける) */}
      {showInput && (
        <p className="mt-8 text-center text-xs italic text-neutral-400">
          {t("bottomHint")}
        </p>
      )}
    </div>
  );
}

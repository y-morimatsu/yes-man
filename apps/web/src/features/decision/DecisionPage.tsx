/**
 * DecisionPage — main page (U7d FD §3.1 + ultrathink Imp1: useReducer state machine).
 *
 * INCEPTION Journey C (drawio 04_NoBurst): No 採択 → 自動再生成 + 段階的 microcopy.
 * - useReducer の "start" は idle→streaming + completed→streaming (regenerate) 両方対応
 * - noStage state (DecisionPage scope) で No 連続採択の累積回数を保持
 * - 別案 streaming 中も NoMicroCopyBanner は持続、Yes 採択時のみ hide
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@yesman/ui";
import { VoiceMicInput } from "../voice/VoiceMicInput";
import { decisionReducer, initialState } from "./reducer";
import { useDecisionStream } from "./useDecisionStream";
import { usePrefetchedDecisions } from "./usePrefetchedDecisions";
import { DecisionResult } from "./DecisionResult";
import { MangaStage } from "./MangaStage";
import { NoMicroCopyBanner } from "./NoMicroCopyBanner";
import { QuickStartCard } from "./QuickStartCard";
import { StageHeader } from "./StageHeader";
import { useQuickStart } from "./useQuickStart";
import { useYesNudge } from "./useYesNudge";
import { YesManMascot, type MascotState } from "./YesManMascot";
import type { ChainNode, StageMode } from "./reducer";
import { usePersonaSource } from "../persona/usePersonaSource";
import { useUnifiedSelection } from "../persona/useUnifiedSelection";
import { describeError } from "./describeError";
import { t } from "./strings";

const PREFETCH_BUFFER_SIZE = 2;

export default function DecisionPage() {
  const [state, dispatch] = useReducer(decisionReducer, initialState);
  // INCEPTION Journey C: No 連打の累積 stage (0=未No、1〜=段階的 microcopy).
  // reducer 外で保持し、regenerate を跨いで持続させる.
  const [noStage, setNoStage] = useState<number>(0);
  // 別案再生成中フラグ (Yes 採択後にも残らないよう reset で 0 に戻す).
  const [regenerating, setRegenerating] = useState(false);
  // 最後に submit した user_input を保持 (regenerate で再利用、reducer state 透過には依存しない).
  const lastInputRef = useRef<string>("");
  // 2026-05-22 yes-no-quickstart: 起動時 YES/NO クイック質問. textbox は quick.mode === "text" 時のみ表示.
  const quick = useQuickStart();

  // No 採択時の待ち時間を消すための buffer (同じ user_input で別案を先 prefetch)
  const prefetch = usePrefetchedDecisions({ bufferSize: PREFETCH_BUFFER_SIZE });

  // issue #93: No 採択 → 別案到着後に Yes 採択を後押しする LLM 動的 microcopy.
  const yesNudge = useYesNudge();
  // 2026-05-23 Drill-down chain: 完了済 proposal 列を保持 (Yes 連鎖時の chain_context として送る)
  const [chain, setChain] = useState<ChainNode[]>([]);
  // Hackathon: 直近の Yes/No 採択を mascot 用に保持 (1.6s で自動 clear).
  const [recentChoice, setRecentChoice] = useState<"yes" | "no" | null>(null);
  // 2026-05-24: MangaStage 上部 overlay 用 DOM 要素 (DecisionResult が proposal-card を
  // createPortal でここに転送). ref callback で state にセットして re-render を trigger.
  const [proposalOverlayEl, setProposalOverlayEl] = useState<HTMLDivElement | null>(
    null,
  );
  const handleChoiceMade = (choice: "yes" | "no") => {
    setRecentChoice(choice);
    window.setTimeout(() => setRecentChoice(null), 1600);
  };

  // v3-γ Task 5: persona source 連携 (Task 4 connecting note の実装).
  // "anonymous" 選択時は stageMode="manga"、DecisionRequestPayload に persona_source を inject.
  const { source: personaSource } = usePersonaSource();
  const stageMode: StageMode = personaSource === "anonymous" ? "manga" : "chat";

  // 2026-05-24 v4: 統合 selection (3 source mix). 指定時は selected_personas で送信.
  const { selection: unifiedSelection } = useUnifiedSelection();

  /** stream payload に selected_personas を merge (非空時のみ). */
  const buildStreamPayload = (
    base: Parameters<typeof startStream>[0],
  ): Parameters<typeof startStream>[0] => {
    if (unifiedSelection.length === 0) return base;
    return { ...base, selected_personas: unifiedSelection };
  };

  const { startStream } = useDecisionStream({
    onStart: (id) => dispatch({ type: "onStart", decisionId: id }),
    onPersonasResolved: (personas) =>
      dispatch({ type: "onPersonasResolved", personas }),
    onUtteranceDelta: (d) =>
      dispatch({
        type: "onUtteranceDelta",
        personaId: d.persona_id,
        personaName: d.persona_name,
        chunk: d.text,
      }),
    onUtterance: (u) =>
      dispatch({ type: "onUtterance", utterance: { ...u, done: true } }),
    onProposal: (data) =>
      dispatch({
        type: "onProposal",
        proposal: data.proposal,
        isFinal: data.isFinal,
        depth: data.depth,
        service: data.service,
      }),
    onComplete: () => {
      dispatch({ type: "onComplete" });
      setRegenerating(false);
      // proposal 確定したら、裏で別案を満タンまで prefetch (No 連打時の待ち時間消し)
      const input = lastInputRef.current;
      if (input) {
        for (let i = 0; i < PREFETCH_BUFFER_SIZE; i++) {
          prefetch.prefetchOne(input);
        }
      }
    },
    onSilence: (message) => dispatch({ type: "onSilence", message }),
    onError: (err) => {
      dispatch({ type: "onError", error: describeError(err) });
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
    // 2026-05-23: 新規 submit は chain を必ず reset (前回の drill-down 履歴を引き継がない)
    setChain([]);
    // 新規 submit のため、前のセッションの buffer を破棄
    prefetch.clear();
    dispatch({ type: "start" });
    await startStream(
      buildStreamPayload({ user_input: state.input, persona_source: personaSource }),
    );
  };

  /** 2026-05-23 Drill-down chain: Yes (非 final) で次段に進む.
   *  現 proposal を chain に push、chain_context を含めて新 stream を起動する. */
  const handleDrillDown = async () => {
    if (state.status !== "completed") return;
    const newNode: ChainNode = {
      decisionId: state.decisionId,
      proposalText: state.proposal,
      depth: state.depth,
    };
    const nextChain = [...chain, newNode];
    setChain(nextChain);
    setNoStage(0); // chain 進行は No carry-forward を reset
    prefetch.clear();
    dispatch({ type: "start" });
    await startStream(
      buildStreamPayload({
        user_input: lastInputRef.current,
        chain_context: nextChain.map((n) => n.proposalText),
        persona_source: personaSource,
      }),
    );
  };

  /** INCEPTION Journey C: No 採択 → 自動再生成 + 段階的 microcopy.
   *  DecisionResult からの callback、no_attempt_count を受けて新 stream を発火.
   *
   *  buffer に prefetch 済の別案があれば即時 swap (loading 演出スキップ).
   *  なければ従来通り startStream で生成中 UI を表示する. */
  const handleNoChosen = async (count: number) => {
    const input = lastInputRef.current;
    if (!input) return;
    setNoStage(count);

    const buffered = prefetch.pop();
    if (buffered) {
      // 即時 swap: completed → completed (新 decisionId / proposal で上書き)
      dispatch({
        type: "swapFromBuffer",
        decisionId: buffered.decisionId,
        utterances: buffered.utterances,
        proposal: buffered.proposal,
      });
      // buffer 補充 (次の No 連打に備える)
      prefetch.prefetchOne(input);
      setRegenerating(false);
      return;
    }

    // buffer 切れの fallback: 従来の同期 stream
    setRegenerating(true);
    dispatch({ type: "start" });
    await startStream(
      buildStreamPayload({ user_input: input, persona_source: personaSource }),
    );
  };

  /** 完全 reset (Yes 採択後の もう一度 / silenced からの Home / error からのやり直し). */
  const handleFullReset = () => {
    setNoStage(0);
    setRegenerating(false);
    yesNudge.clear();
    setChain([]);
    lastInputRef.current = "";
    prefetch.clear();
    dispatch({ type: "reset" });
  };

  // issue #93: state.status==="completed" && noStage>0 で yes-nudge を fetch。
  // decisionId が変わる度に (buffer-swap / 新 stream complete) re-fetch。
  useEffect(() => {
    if (state.status === "completed" && noStage > 0 && state.decisionId) {
      yesNudge.fetchOne(state.decisionId, noStage);
    }
    // yesNudge.fetchOne / .clear は useCallback で安定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.status === "completed" ? state.decisionId : null, noStage]);

  // idle / error 時にカード or textbox を出す。quickstart mode "quick" のときは QuickStartCard、
  // mode "text" になったら従来 UI (textbox + voice + persona pill) に切替.
  const showInputArea = state.status === "idle" || state.status === "error";
  const showQuickStart = showInputArea && quick.mode === "quick" && quick.current !== null;
  const showTextInput = showInputArea && !showQuickStart;
  const inputValue =
    state.status === "idle" || state.status === "error" || state.status === "streaming"
      ? state.input
      : "";

  // QuickStart の YES = 現在質問を user_input にセットして即合議 start
  const handleQuickYes = async () => {
    const title = quick.accept();
    if (!title) return;
    dispatch({ type: "setInput", input: title });
    lastInputRef.current = title;
    setNoStage(0);
    setRegenerating(false);
    prefetch.clear();
    dispatch({ type: "start" });
    await startStream(
      buildStreamPayload({ user_input: title, persona_source: personaSource }),
    );
  };

  // mockup §5: 合議進行中 (streaming/completed) は専用 StageHeader を表示、
  // idle/error 時は従来の pageTitle h1 を表示 (両経路で共通).
  const isInDiscussion =
    state.status === "streaming" || state.status === "completed";

  return (
    // 2026-05-24 v9: mobile (iPhone SE 667 / iPhone 12 Pro 844) で全要素を viewport に収めるため
    //   h-full (= main の content area = viewport - header - pt - pb) を使用.
    //   MangaStage は flex-1 で残り空間を動的フィット、bubble/actor は内部 absolute で配置.
    //   idle / error 時は通常の auto-height layout (input area が小さいため不要).
    <div
      className={`flex flex-col gap-3 ${isInDiscussion ? "h-full" : ""}`}
    >
      {isInDiscussion ? (
        <StageHeader
          participantCount={state.utterances.length || 3}
          topic={lastInputRef.current}
          onBack={handleFullReset}
          status={state.status === "completed" ? "completed" : "streaming"}
        />
      ) : (
        <h1 className="font-serif text-lg font-bold">{t("pageTitle")}</h1>
      )}

      {showQuickStart && quick.current && (
        // key={current.id}: 次候補へ進む際に SwipeChoice 内の confirming/dx 残留を防ぐため
        // QuickStartCard 全体を remount。reject 時に SwipeChoice の動的 state が
        // 持ち越されると、新題目で「すでに左にスワイプされた」状態から始まってしまう.
        <QuickStartCard
          key={quick.current.id}
          title={quick.current.title}
          noCount={quick.noCount}
          onYes={handleQuickYes}
          onNo={quick.reject}
          onSwitchToText={quick.switchToText}
        />
      )}

      {showTextInput && (
        <>
          {/* テキスト入力 + 送信ボタン を横並び (chat/search UI の親和性、INCEPTION 01 から UX 改善).
              Enter キーでの誤送信は抑制 (送信は明示的にボタンを押すフローに統一). */}
          <div className="flex gap-2 items-stretch">
            <Input
              value={inputValue}
              onChange={(e) => dispatch({ type: "setInput", input: e.target.value })}
              placeholder={t("inputPlaceholder")}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // 送信は明示的にボタンを押す UX に統一、誤送信防止
                  e.preventDefault();
                }
              }}
            />
            <Button
              onClick={handleStart}
              disabled={!inputValue}
            >
              {t("startButton")}
            </Button>
          </div>

          {/* INCEPTION screen-01: 中央配置 voice button */}
          <div className="flex flex-col items-center gap-1 my-2">
            <VoiceMicInput
              onTranscript={(text) => dispatch({ type: "setInput", input: text })}
            />
          </div>

          {/* INCEPTION screen-01: ダッシュド divider */}
          <hr
            className="my-3 border-t border-dashed"
            style={{ borderColor: "#E0D5BC" }}
          />

          {/* INCEPTION screen-01: inline persona セレクタ pill (FR-PERSONA-10、最大 3) */}
          <Link
            to="/personas/selection"
            className="block rounded-xl border bg-neutral-100 px-4 py-2.5 text-center text-sm text-neutral-700 hover:bg-neutral-200"
            style={{ borderColor: "#E0D5BC" }}
            aria-label="合議に使うペルソナを選択"
            data-testid="persona-selector-pill"
          >
            🛡️ 慎重派 ・ ☀️ 楽観派 ・ ⚡ 効率派 [▼]
          </Link>
        </>
      )}

      {/* INCEPTION Journey C: No 連打 microcopy banner (regenerate を跨いで持続)
          issue #93: LLM 動的 microcopy (yesNudge.message) を優先表示、
          未到着/失敗時は stage 別 static fallback (NoMicroCopyBanner 内) */}
      {noStage > 0 &&
        (state.status === "streaming" || state.status === "completed") && (
          <NoMicroCopyBanner
            stage={noStage}
            regenerating={regenerating}
            dynamicMessage={yesNudge.message}
          />
        )}

      {/* 2026-05-24: 両経路 (builtin + anonymous) で MangaStage を utterance render に使用.
          DecisionResult の bubble は常時 hide (重複防止). proposal-card は React Portal で
          MangaStage 上部 overlay に転送 (空き領域に SwipeChoice + 結論 + pink nudge を表示). */}
      {(state.status === "streaming" || state.status === "completed") && (
        <MangaStage
          utterances={state.utterances}
          currentSpeakerId={state.lastSpeakerId ?? undefined}
          personaSource={personaSource}
        >
          {/* proposal-card は DecisionResult が createPortal で ここに render する.
              この div の ref を proposalOverlayEl state に登録して DecisionResult に渡す. */}
          <div ref={setProposalOverlayEl} />
        </MangaStage>
      )}

      {(state.status === "streaming" || state.status === "completed") && (
        <DecisionResult
          utterances={state.utterances}
          proposal={state.status === "completed" ? state.proposal : state.proposal}
          decisionId={state.status === "completed" ? state.decisionId : null}
          onComplete={handleFullReset}
          onNoChosen={handleNoChosen}
          onChoiceMade={handleChoiceMade}
          // 2026-05-23 Drill-down chain
          isFinal={state.status === "completed" ? state.isFinal : false}
          depth={state.status === "completed" ? state.depth : 0}
          chain={chain}
          service={state.status === "completed" ? state.service : null}
          onDrillDown={handleDrillDown}
          // 2026-05-24: 両経路で MangaStage を bubble 表示に使うため、ここの bubble は常時 hide.
          hideUtterances
          // 2026-05-24: proposal-card を MangaStage の overlay 領域に Portal で render.
          proposalCardPortal={proposalOverlayEl}
        />
      )}

      {/* INCEPTION D Silence Theater: 沈黙ドメイン (宗教/選挙/暴力/卑猥) 検出時.
          screen-05-silence-domain.svg 完全準拠: ダーク背景 #1A2329、ダッシュド円囲み「…」、
          4 ドメイン絵文字 opacity 0.35、ミュート系の色階調 */}
      {state.status === "silenced" && (
        <div
          className="rounded-2xl p-8 text-center relative overflow-hidden"
          style={{ background: "#1A2329" }}
          role="region"
          aria-label="沈黙演出"
        >
          {/* ダッシュド円 + 中央「…」 (drawio: circle r=56 stroke #455A64 dasharray 2 4) */}
          <div className="flex flex-col items-center">
            <svg viewBox="-64 -64 128 128" width="120" height="120" aria-hidden>
              <circle
                r="56"
                fill="none"
                stroke="#455A64"
                strokeWidth="0.5"
                strokeDasharray="2 4"
              />
              <text
                x="0"
                y="14"
                textAnchor="middle"
                fontSize="40"
                fontWeight="300"
                fill="#78909C"
              >
                …
              </text>
            </svg>
          </div>
          <p
            className="text-sm italic mt-1"
            style={{ color: "#78909C" }}
          >
            （沈黙）
          </p>
          <p
            className="text-xs mt-3"
            style={{ color: "#607D8B" }}
          >
            この領域は AI が 代行しません
          </p>
          {/* 4 ドメイン絵文字 ⛪🗳️⚔️🔞 opacity 0.35 (drawio L28-33 準拠) */}
          <div
            className="flex justify-center gap-8 mt-6 text-2xl"
            style={{ opacity: 0.35 }}
            aria-hidden
          >
            <span>⛪</span>
            <span>🗳️</span>
            <span>⚔️</span>
            <span>🔞</span>
          </div>
          <p className="text-[10px] mt-2" style={{ color: "#546E7A" }}>
            宗教 / 選挙 / 暴力 / 卑猥
          </p>
          <p className="text-[10px]" style={{ color: "#546E7A" }}>
            ＝ ご自身で 判断する 領域
          </p>
          {state.message && (
            <p className="mt-3 text-sm whitespace-pre-wrap" style={{ color: "#90A4AE" }}>
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={handleFullReset}
            className="mt-6 text-xs italic underline"
            style={{ color: "#455A64" }}
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
      {showInputArea && (
        <p className="mt-8 text-center text-xs italic text-neutral-400">
          {t("bottomHint")}
        </p>
      )}

      {/* Hackathon: YesMan マスコット (右下 fixed、Portal 風)、状況に応じて吹き出し */}
      <YesManMascot state={resolveMascotState(state.status, recentChoice)} />
    </div>
  );
}

/** mascot 表示状態を state.status + recentChoice から導出. */
function resolveMascotState(
  status: "idle" | "streaming" | "completed" | "silenced" | "error",
  recentChoice: "yes" | "no" | null,
): MascotState {
  if (recentChoice === "yes") return "yes";
  if (recentChoice === "no") return "no";
  if (status === "silenced") return "silenced";
  if (status === "streaming") return "streaming";
  if (status === "completed") return "proposing";
  return "hidden";
}

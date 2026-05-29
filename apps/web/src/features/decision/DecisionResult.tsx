/**
 * DecisionResult — INCEPTION drawio B4 + B7 + Journey C 完全準拠.
 *
 * 構造:
 * 1. SSE streaming 中: utterance bubbles (議論を見るで toggle) — LIVE badge は UX 改善で削除
 * 2. proposal 完了: 3-line proposal card + SwipeChoice (swipe / fallback button)
 * 3. Yes 採択: NudgeBanner で ✨🎉✨ celebration (final state)
 * 4. No 採択: onNoChosen callback で親に regenerate を委譲 (drawio Journey C)
 *    - choose API は call して no_attempt_count を取得
 *    - DecisionResult 内部は chosen state を更新しない
 *    - 親が microcopy banner + startStream による別案再生成を hold
 * 5. 議論を見る (FR-CV-04) は proposal 後ずっと visible (採択後も残置)
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DecisionUtteranceBubble,
  Skeleton,
  SwipeChoice,
  useToast,
} from "@yesman/ui";
import type { ChainNode, ExternalServiceLink, Utterance } from "./reducer";
import { useChooseMutation } from "./useDecision";
import { NudgeBanner } from "./NudgeBanner";
import { YesComboBadge } from "./YesComboBadge";
import { useYesCombo } from "./useYesCombo";
import { describeError } from "./describeError";
import { t } from "./strings";
import { getConfirmFlow, type ConfirmAction } from "./confirmQuestions";
import confetti from "canvas-confetti";

// backend engine.py の MAX_DRILL_DEPTH と同期 (4). 増減時は両側更新.
const MAX_DRILL_DEPTH = 4;

export interface DecisionResultProps {
  utterances: Utterance[];
  proposal: string | null;
  decisionId: string | null;
  onComplete: () => void;
  /** No 採択時に parent へ no_attempt_count を通知し、別案 regenerate を依頼.
   *  INCEPTION Journey C: No → 自動再生成 + 段階的 microcopy. */
  onNoChosen?: (noAttemptCount: number) => void;
  /** Hackathon: 親 (DecisionPage) で mascot 状態を切り替えるための callback. */
  onChoiceMade?: (choice: "yes" | "no") => void;
  /** 2026-05-23 Drill-down chain: 下スワイプ「もっと絞る」のハンドラ.
   *  isFinal=false のときに呼ぶ。指定時は内部 choose API を call せず、親が新 stream を起動。 */
  onDrillDown?: () => void;
  /** 2026-05-29 上スワイプ「やめる」= 中断. 親で入力画面に戻す (handleFullReset). */
  onAbort?: () => void;
  /** 2026-05-23 Drill-down chain: 現提案が最終かどうか. true なら Yes 採択 (choose API + 祝福). */
  isFinal?: boolean;
  /** 2026-05-26 Drill-down hint: 現在の depth (= chain.length). pink-nudge で「あと N 段で決定」表示用. */
  depth?: number;
  /** 2026-05-23 Drill-down chain: chain history (breadcrumb 表示用). */
  chain?: ChainNode[];
  /** 2026-05-23 Drill-down chain: final 提案に紐づく外部 service. CTA button で URL を開く. */
  service?: ExternalServiceLink | null;
  /** v3-γ Task 5: anonymous 経路で MangaStage が utterance を可視化する場合、
   *  内部 bubble + 「議論を見る」 toggle を隠す (重複表示防止). */
  hideUtterances?: boolean;
  /** 2026-05-24: proposal-card (SwipeChoice + 結論カード + pink nudge) を React Portal で
   *  別 DOM 要素に render する. MangaStage 上部 overlay に提案を表示するために使用.
   *  null/undefined なら従来通り inline render. */
  proposalCardPortal?: HTMLElement | null;
}

export function DecisionResult({
  utterances,
  proposal,
  decisionId,
  onComplete,
  onNoChosen,
  onChoiceMade,
  onDrillDown,
  onAbort,
  isFinal = true,
  depth = 0,
  chain = [],
  service = null,
  hideUtterances = false,
  proposalCardPortal = null,
}: DecisionResultProps) {
  const choose = useChooseMutation();
  const { push } = useToast();
  const [chosen, setChosen] = useState<"yes" | null>(null); // Yes 採択のみ最終 state
  const [noCount, setNoCount] = useState<number>(0);
  // INCEPTION FR-CV-04: 議論を見る default closed、採択後も visible
  const [discussionOpen, setDiscussionOpen] = useState(false);
  // 2026-05-26: final 後の「持っていますか? / 購入しますか?」 確認 step 用 state.
  //   confirmStepId !== null = 確認 step 表示中 (SwipeChoice の proposalText を上書き).
  //   confirmDone="stop" = ユーザーが No で打ち切った → 「今回は やめておこう」 banner.
  const confirmFlow = isFinal && service ? getConfirmFlow(service.category) : null;
  const [confirmStepId, setConfirmStepId] = useState<string | null>(null);
  const [confirmDone, setConfirmDone] = useState<"open" | "stop" | null>(null);
  // Hackathon: Yes 連続採択 combo (localStorage 日次 reset)
  const combo = useYesCombo();
  // Hackathon: proposal 初到着時の「合議完了」notification (1 回だけ表示)
  const [showProposalNotification, setShowProposalNotification] = useState(false);
  useEffect(() => {
    if (proposal !== null) {
      setShowProposalNotification(true);
      const t = setTimeout(() => setShowProposalNotification(false), 2400);
      return () => clearTimeout(t);
    }
  }, [proposal, decisionId]);

  /** combo 数に応じた confetti スケール (3+ で multi-wave、10+ で大爆発). */
  const fireConfetti = (comboCount: number) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const baseColors = ["#9F88C8", "#E8775A", "#FFD6E0"];
    if (comboCount >= 10) {
      // 大爆発: 2 wave + gold colors
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.2 },
        colors: ["#FFD700", "#FF8C00", "#FFFFFF", ...baseColors],
        ticks: 220,
        scalar: 1.3,
      });
      setTimeout(
        () =>
          confetti({
            particleCount: 80,
            spread: 130,
            origin: { y: 0.3, x: 0.2 },
            colors: ["#FFD700", "#FF8C00"],
            ticks: 200,
            scalar: 1.2,
          }),
        180,
      );
      setTimeout(
        () =>
          confetti({
            particleCount: 80,
            spread: 130,
            origin: { y: 0.3, x: 0.8 },
            colors: ["#FFD700", "#FF8C00"],
            ticks: 200,
            scalar: 1.2,
          }),
        180,
      );
    } else if (comboCount >= 5) {
      confetti({
        particleCount: 90,
        spread: 100,
        origin: { y: 0.2 },
        colors: ["#C084FC", "#FBCFE8", ...baseColors],
        ticks: 180,
        scalar: 1.2,
      });
    } else if (comboCount >= 3) {
      confetti({
        particleCount: 70,
        spread: 90,
        origin: { y: 0.2 },
        colors: ["#FCD34D", "#FEF3C7", ...baseColors],
        ticks: 160,
        scalar: 1.15,
      });
    } else {
      confetti({
        particleCount: 50,
        spread: 80,
        origin: { y: 0.2 },
        colors: baseColors,
        ticks: 150,
        scalar: 1.1,
      });
    }
    // Mobile App Polish §9: Haptic feedback (Android 動作、iOS no-op)
    if ("vibrate" in navigator) {
      navigator.vibrate(comboCount >= 5 ? [50, 30, 80] : 50);
    }
  };

  const handleChoose = async (choice: "yes" | "no") => {
    if (!decisionId) return;
    // 2026-05-29: Yes (右スワイプ) は常に「確定」。深掘りは下スワイプ (handleDown) に分離.
    // 2026-05-26: final Yes で category confirm flow がある場合は popup を直開せず
    // confirm step に遷移. choose API も confirm 終了後に呼ぶ.
    // (非 final でも confirmFlow は無い ので、その場合はそのまま choose("yes") = 即確定)
    if (choice === "yes" && isFinal && confirmFlow && confirmStepId === null) {
      onChoiceMade?.("yes");
      setConfirmStepId(confirmFlow.start);
      return;
    }
    try {
      const result = await choose.mutateAsync({ id: decisionId, choice });
      const count = result?.no_attempt_count ?? 0;
      if (choice === "yes") {
        const newCombo = combo.recordYes();
        setChosen("yes");
        setNoCount(count);
        fireConfetti(newCombo);
        onChoiceMade?.("yes");
      } else {
        combo.recordNo();
        onChoiceMade?.("no");
        // INCEPTION Journey C: No → 親に regenerate 委譲
        onNoChosen?.(count);
      }
    } catch (err) {
      push({ message: `${t("errorDefault")}: ${describeError(err)}`, variant: "error" });
    }
  };

  // 2026-05-29 下スワイプ = もっと絞る (深掘り). 非 final + onDrillDown 有効時のみ.
  const canDrillDown = !isFinal && !!onDrillDown;
  const handleDown = () => {
    if (!canDrillDown) return;
    onChoiceMade?.("yes"); // 深掘りは前向きアクション → mascot は yes 寄り表情
    onDrillDown!();
  };

  // 2026-05-29 上スワイプ = 中断 (やめる) → 入力画面に戻る (親の onAbort).
  const handleUp = () => {
    onAbort?.();
  };

  /** 2026-05-26: confirm step (Yes/No) の遷移. action に基づき次 step / open / stop を実行. */
  const applyConfirmAction = (action: ConfirmAction) => {
    if (action.kind === "next") {
      setConfirmStepId(action.stepId);
      return;
    }
    // open / stop はどちらも flow 完了 → chosen=yes をセットして choose API 呼ぶ.
    setConfirmStepId(null);
    setConfirmDone(action.kind);
    if (!decisionId) return;
    void (async () => {
      try {
        const result = await choose.mutateAsync({ id: decisionId, choice: "yes" });
        const count = result?.no_attempt_count ?? 0;
        const newCombo = combo.recordYes();
        setChosen("yes");
        setNoCount(count);
        // open のときだけ大盛 confetti、stop でも採択は採択なので軽め celebration
        fireConfetti(action.kind === "open" ? newCombo : 1);
      } catch (err) {
        push({
          message: `${t("errorDefault")}: ${describeError(err)}`,
          variant: "error",
        });
      }
    })();
  };

  const handleConfirmYes = () => {
    if (!confirmFlow || !confirmStepId) return;
    const step = confirmFlow.steps[confirmStepId];
    if (!step) return;
    applyConfirmAction(step.onYes);
  };

  const handleConfirmNo = () => {
    if (!confirmFlow || !confirmStepId) return;
    const step = confirmFlow.steps[confirmStepId];
    if (!step) return;
    applyConfirmAction(step.onNo);
  };

  const isStreaming = proposal === null;
  // v3-γ Task 5: anonymous 経路では MangaStage 側で utterance を表示するため、
  // DecisionResult 内 bubble + toggle を隠す.
  const showUtterances = !hideUtterances && (isStreaming || discussionOpen);
  const showDiscussionButton = !hideUtterances && !isStreaming;

  return (
    <div className="flex flex-col gap-4">
      {/* 2026-05-23 Drill-down chain: 既出 proposal の breadcrumb (depth >= 1 で表示) */}
      {chain.length > 0 && (
        <nav
          className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs"
          aria-label="深堀り chain"
          data-testid="drill-down-chain"
        >
          <span className="font-bold text-brand-700">🪜 これまでの決定:</span>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-neutral-700">
            {chain.map((node, i) => (
              <span key={node.decisionId} className="inline-flex items-center gap-1">
                {i > 0 && <span aria-hidden className="text-brand-400">→</span>}
                <span className="rounded-md bg-neutral-0 px-2 py-0.5 border border-brand-200">
                  {node.proposalText}
                </span>
              </span>
            ))}
          </div>
        </nav>
      )}

      {/* 2026-05-26: 外部サービス CTA は「これまでの決定」直下に表示 (NudgeBanner より上).
          画面下までスクロールしなくても押せるようにするための位置改善.
          confirmDone === "stop" の場合は popup を開かなかったので CTA は隠す. */}
      {chosen === "yes" && service && confirmDone !== "stop" && (
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className="self-stretch rounded-2xl border-2 border-success bg-success/10 px-4 py-3 text-center text-base font-bold text-success-700 hover:bg-success/20 transition-colors shadow-md flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #ECFDF5, #86EFAC33)",
            borderColor: "#22C55E",
            color: "#065F46",
          }}
          aria-label={`${service.name} で開く (外部リンク)`}
          data-testid="external-service-cta"
        >
          <span aria-hidden className="text-2xl">
            {service.emoji}
          </span>
          <span>{service.name} で開く →</span>
        </a>
      )}

      {/* 2026-05-26: confirm No で stop した場合の「やめておこう」 banner. */}
      {chosen === "yes" && confirmDone === "stop" && (
        <div
          className="self-stretch rounded-2xl border-2 px-4 py-3 text-center text-sm font-medium shadow-sm flex items-center justify-center gap-2"
          style={{
            background: "#FFF8E7",
            borderColor: "#E0D5BC",
            color: "#7A5C2A",
          }}
          role="status"
          aria-label="今回はやめておこう"
          data-testid="confirm-stop-banner"
        >
          <span aria-hidden>🙆</span>
          <span>今回は やめておこう ♪</span>
        </div>
      )}

      {/* Hackathon: Yes 連続採択 combo badge (chosen=yes 時 + 2 連以上 or break 時) */}
      {(combo.count >= 2 || combo.brokeCombo) && (
        <YesComboBadge
          count={combo.count}
          brokeCombo={combo.brokeCombo}
          onBrokeComboShown={combo.clearBrokeCombo}
        />
      )}

      {/* Hackathon: proposal 初到着時の「合議完了」notification (2.4s で fade out) */}
      {showProposalNotification && proposal && (
        <div
          className="self-stretch rounded-xl border bg-brand-50 px-4 py-2 text-center text-sm font-medium text-brand-700 shadow-sm"
          role="status"
          aria-label="合議完了通知"
          data-testid="proposal-arrival-notification"
          data-ym-anim
          style={{
            borderColor: "#9F88C8",
            animation: "ym-notification-slide-down 2.4s ease-in-out forwards",
          }}
        >
          📨 合議が完了しました
        </div>
      )}

      {/* Post-CONSTRUCTION v3 (2026-05-23): 旧 PersonaThinkingChips は廃止。
          persona 名・発言中 status は bubble header に統合 (重複排除)。 */}

      {/* utterance bubbles (議論を見るで toggle、persona icons は bubble 内蔵).
          Post-CONSTRUCTION v3 (2026-05-23): bubble は streaming 中の delta も
          そのまま render (text が空文字でも自動増分するので box が「パラパラ」と埋まる).
          未到着 persona 分の skeleton は bubble の下に残数だけ表示。 */}
      {showUtterances && (
        <div
          className="flex flex-col gap-2"
          role="region"
          aria-label="議論 (utterance 一覧)"
          id="discussion-region"
        >
          {utterances.map((u) => (
            <DecisionUtteranceBubble
              key={u.persona_id}
              personaName={u.persona_name}
              text={u.text}
              streaming={!u.done}
            />
          ))}
          {isStreaming &&
            utterances.length < 3 &&
            Array.from({ length: 3 - utterances.length }).map((_, i) => (
              <Skeleton key={`utterance-skel-${i}`} className="h-16 w-full" />
            ))}
        </div>
      )}

      {/* 2026-05-24: proposal-card + pink nudge を変数化. proposalCardPortal が指定されていれば
          createPortal で外部 DOM (例: MangaStage overlay) に render、なければ inline.
          Yes 採択後 (chosen==="yes") も同じ overlay 位置に read-only な「決まったこと」card を残置
          ─ 「ばーんと消える」体感を抑制し、結果を視覚的に持続表示. */}
      {proposal && (() => {
        const isChosenYes = chosen === "yes";
        // 2026-05-26: confirm phase 中は SwipeChoice の text を confirm 質問に差し替える.
        const confirmStep = confirmFlow && confirmStepId
          ? confirmFlow.steps[confirmStepId] ?? null
          : null;
        // window.open は confirm phase の最終 Yes (action="open") かつ "buy" 系 step の
        // onYesSync で user gesture chain 内同期発火する (popup block 回避).
        // confirmFlow 無しの旧経路 (例: confirmFlow=null) は従来通り SwipeChoice の Yes で即 open.
        const isOpenStep =
          confirmStep && confirmStep.onYes.kind === "open" && !!service;
        const proposalCardBlock = (
          <>
            {/* mockup §6 結論カード — 結論 (overlay 用に mini-stage は省略).
                Yes 採択後は SwipeChoice を外し、card と「✨ 決まりました」 nudge のみ残置. */}
            {isChosenYes ? (
              <article
                className="rounded-3xl overflow-hidden shadow-md flex flex-col"
                style={{
                  background: "#FFFCF4",
                  border: "0.5px solid rgba(46, 36, 24, 0.30)",
                  boxShadow: "0 14px 36px rgba(46,36,24,0.14)",
                }}
                aria-label="採択された結論"
                role="article"
                data-testid="proposal-result-card-chosen"
              >
                <div className="px-4 pt-3 pb-2 text-center">
                  <p
                    className="text-[12px] uppercase tracking-widest mb-1"
                    style={{ color: "rgba(46, 36, 24, 0.55)" }}
                  >
                    決まったこと
                  </p>
                  <p
                    className="font-medium"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 20,
                      lineHeight: 1.3,
                      color: "#2E2418",
                    }}
                  >
                    {proposal}
                  </p>
                </div>
              </article>
            ) : confirmStep ? (
              <SwipeChoice
                key={`confirm-${confirmStepId}`}
                proposalText={confirmStep.question}
                onYes={handleConfirmYes}
                onNo={handleConfirmNo}
                disabled={choose.isPending}
                showSwipeHint={!proposalCardPortal}
                onYesSync={
                  isOpenStep && service
                    ? () => {
                        window.open(service.url, "_blank", "noopener,noreferrer");
                      }
                    : undefined
                }
                yesAriaLabelOverride={
                  isOpenStep && service
                    ? `Yes (新しいタブで ${service.name} を開きます)`
                    : undefined
                }
              >
                <article
                  className="rounded-3xl overflow-hidden shadow-md flex flex-col"
                  style={{
                    background: "#FFFCF4",
                    border: "0.5px solid rgba(46, 36, 24, 0.30)",
                    boxShadow: "0 14px 36px rgba(46,36,24,0.14)",
                  }}
                  aria-label="確認質問"
                  role="article"
                  data-testid="confirm-step-card"
                >
                  <div className="px-4 pt-3 pb-2 text-center">
                    <p
                      className="text-[12px] uppercase tracking-widest mb-1"
                      style={{ color: "rgba(46, 36, 24, 0.55)" }}
                    >
                      確認
                    </p>
                    <p
                      className="font-medium"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 20,
                        lineHeight: 1.3,
                        color: "#2E2418",
                      }}
                    >
                      {confirmStep.question}
                    </p>
                  </div>
                </article>
              </SwipeChoice>
            ) : (
              <SwipeChoice
                key={decisionId ?? "no-decision"}
                proposalText={proposal}
                onYes={() => handleChoose("yes")}
                onNo={() => handleChoose("no")}
                disabled={choose.isPending}
                showSwipeHint={!proposalCardPortal}
                // 2026-05-26 drill-down-auto-open (FR-DAO-02/03/09 + NFR-DAO-06/07/10):
                // final 段 (isFinal=true) + service≠null のみ自動 open + a11y override を有効化.
                // 2026-05-26 (confirm phase): confirmFlow がある category は Yes で confirm step に
                // 遷移するので window.open しない. confirmFlow=null なら従来通り即 open.
                onYesSync={
                  isFinal && service && !confirmFlow
                    ? () => {
                        window.open(service.url, "_blank", "noopener,noreferrer");
                      }
                    : undefined
                }
                yesAriaLabelOverride={
                  isFinal && service && !confirmFlow
                    ? `Yes、提案を採択 (新しいタブで ${service.name} を開きます)`
                    : undefined
                }
                // 2026-05-29 4方向: 下=もっと絞る (非finalのみ) / 上=やめる (中断)
                onDown={canDrillDown ? handleDown : undefined}
                downLabel="もっと絞る"
                onUp={onAbort ? handleUp : undefined}
                upLabel="やめる"
              >
                <article
                  className="rounded-3xl overflow-hidden shadow-md flex flex-col"
                  style={{
                    background: "#FFFCF4",
                    border: "0.5px solid rgba(46, 36, 24, 0.30)",
                    boxShadow: "0 14px 36px rgba(46,36,24,0.14)",
                  }}
                  aria-label="提案"
                  role="article"
                  data-testid="proposal-result-card"
                >
                  <div className="px-4 pt-3 pb-2 text-center">
                    <p
                      className="font-medium"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 20,
                        lineHeight: 1.3,
                        color: "#2E2418",
                      }}
                    >
                      {proposal}
                    </p>
                  </div>
                </article>
              </SwipeChoice>
            )}

            {/* INCEPTION 03-proposal-card.svg L46-49: 下部 pink nudge banner.
                2026-05-26: drill-down 中は「あと N 段で決定」明示、最終段は「Yes で外部サービスへ」.
                Yes 採択後は「✨ 決まりました」 にメッセージ切替. */}
            <div
              className="mt-2 rounded-xl border px-3 py-1.5 text-center"
              style={{
                background: isChosenYes || isFinal ? "#FFD6E0" : "#E7F0FF",
                borderColor: isChosenYes || isFinal ? "#FF8FAE" : "#7BAEFF",
              }}
              role="region"
              aria-label="合議メッセージ"
              data-testid="proposal-pink-nudge"
            >
              <p
                className="text-[13px]"
                style={{ color: isChosenYes || isFinal ? "#E8775A" : "#3A66B5" }}
              >
                {isChosenYes ? (
                  <>
                    <span className="font-bold">✨ 決まりました。</span>
                    <span className="ml-1">あとは行動するだけ ♪</span>
                  </>
                ) : confirmStep ? (
                  // 2026-05-26 confirm phase: 「持っていますか?」 等の確認 step 中.
                  isOpenStep && service ? (
                    <>
                      <span className="font-bold">📍 最終確認。</span>
                      <span className="ml-1">
                        Yes で {service.name} を開きます
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold">📍 確認です。</span>
                      <span className="ml-1">Yes / No で答えてね</span>
                    </>
                  )
                ) : isFinal && service && confirmFlow ? (
                  // 2026-05-26: confirm flow がある category は Yes で confirm step に進む.
                  <>
                    <span className="font-bold">✨ これで決定。</span>
                    <span className="ml-1">Yes で 確認に 進みます</span>
                  </>
                ) : isFinal && service ? (
                  <>
                    <span className="font-bold">✨ これで決定。</span>
                    <span className="ml-1">Yes で 外部サービスへ →</span>
                  </>
                ) : isFinal ? (
                  // 2026-05-26 (C 案): service 強制撤廃. 自宅完結 final の文言.
                  <>
                    <span className="font-bold">✨ これで決定。</span>
                    <span className="ml-1">Yes で 決まり ♪</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold">🪜 → で今すぐ決定。</span>
                    <span className="ml-1">
                      ↓ で もっと絞る (あと {Math.max(1, MAX_DRILL_DEPTH - depth)} 段)
                    </span>
                  </>
                )}
              </p>
            </div>
          </>
        );
        return proposalCardPortal
          ? createPortal(proposalCardBlock, proposalCardPortal)
          : proposalCardBlock;
      })()}

      {/* 議論を見る toggle (FR-CV-04): proposal 後ずっと visible、採択後も残置 */}
      {showDiscussionButton && (
        <button
          type="button"
          onClick={() => setDiscussionOpen((v) => !v)}
          aria-expanded={discussionOpen}
          aria-controls="discussion-region"
          data-testid="discussion-toggle"
          className="self-center rounded-xl border-2 border-dashed border-brand-600 px-4 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50"
        >
          {discussionOpen
            ? "▲ 議論を閉じる"
            : "📂 議論を見る"}
        </button>
      )}

      {/* Yes 採択: NudgeBanner celebration (final state). proposal text は overlay 側で
          常時表示するため、NudgeBanner には渡さない (重複防止). */}
      {chosen === "yes" && decisionId && (
        <NudgeBanner
          decisionId={decisionId}
          choice="yes"
          noAttemptCount={noCount}
          onReset={onComplete}
        />
      )}

    </div>
  );
}

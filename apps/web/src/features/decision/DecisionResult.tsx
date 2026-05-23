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
import {
  DecisionUtteranceBubble,
  Skeleton,
  SwipeChoice,
  useToast,
} from "@yesman/ui";
import type { Utterance } from "./reducer";
import { useChooseMutation } from "./useDecision";
import { NudgeBanner } from "./NudgeBanner";
import { YesComboBadge } from "./YesComboBadge";
import { useYesCombo } from "./useYesCombo";
import { describeError } from "./describeError";
import { t } from "./strings";
import confetti from "canvas-confetti";

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
}

export function DecisionResult({
  utterances,
  proposal,
  decisionId,
  onComplete,
  onNoChosen,
  onChoiceMade,
}: DecisionResultProps) {
  const choose = useChooseMutation();
  const { push } = useToast();
  const [chosen, setChosen] = useState<"yes" | null>(null); // Yes 採択のみ最終 state
  const [noCount, setNoCount] = useState<number>(0);
  // INCEPTION FR-CV-04: 議論を見る default closed、採択後も visible
  const [discussionOpen, setDiscussionOpen] = useState(false);
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

  const isStreaming = proposal === null;
  const showUtterances = isStreaming || discussionOpen;
  const showDiscussionButton = !isStreaming;

  return (
    <div className="flex flex-col gap-4">
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

      {/* INCEPTION B4: 3-line proposal card + SwipeChoice (swipe + fallback button).
          key={decisionId}: buffer swap で No 確定済 internal state (confirming/dx) を
          持ち越さないよう、別案到着時は instance を強制 remount する. */}
      {proposal && !chosen && (
        <SwipeChoice
          key={decisionId ?? "no-decision"}
          proposalText={proposal}
          onYes={() => handleChoose("yes")}
          onNo={() => handleChoose("no")}
          disabled={choose.isPending}
        >
          <article
            className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 p-6 shadow-md flex flex-col items-center gap-2"
            aria-label="提案"
            role="article"
          >
            <p className="text-sm text-neutral-700">今日の あなたの 結論は</p>
            <p className="font-serif text-2xl font-bold text-neutral-900 text-center">
              {proposal}
            </p>
            <p className="text-xs italic text-brand-600">
              {t("proposalPrefixCopy")}
            </p>
          </article>
        </SwipeChoice>
      )}

      {/* INCEPTION 03-proposal-card.svg L46-49: 下部 pink nudge banner (proposal 表示中は常時表示).
          「合議された結論です。/ 迷う必要は ありません ♪」 */}
      {proposal && !chosen && (
        <div
          className="rounded-2xl border px-4 py-3 text-center"
          style={{ background: "#FFD6E0", borderColor: "#FF8FAE" }}
          role="region"
          aria-label="合議メッセージ"
          data-testid="proposal-pink-nudge"
        >
          <p className="text-xs font-bold" style={{ color: "#E8775A" }}>
            合議された結論です。
          </p>
          <p className="text-xs" style={{ color: "#E8775A" }}>
            迷う必要は ありません ♪
          </p>
        </div>
      )}

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

      {/* Yes 採択: NudgeBanner celebration (final state). No は親側で別案 regenerate */}
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

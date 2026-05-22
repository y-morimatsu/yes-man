/**
 * DecisionResult — INCEPTION drawio B4 + B7 + Journey C 完全準拠.
 *
 * 構造:
 * 1. SSE streaming 中: 🔴 LIVE badge + utterance bubbles (議論を見るで toggle)
 * 2. proposal 完了: 3-line proposal card + SwipeChoice (swipe / fallback button)
 * 3. Yes 採択: NudgeBanner で ✨🎉✨ celebration (final state)
 * 4. No 採択: onNoChosen callback で親に regenerate を委譲 (drawio Journey C)
 *    - choose API は call して no_attempt_count を取得
 *    - DecisionResult 内部は chosen state を更新しない
 *    - 親が microcopy banner + startStream による別案再生成を hold
 * 5. 議論を見る (FR-CV-04) は proposal 後ずっと visible (採択後も残置)
 */
import { useState } from "react";
import {
  DecisionUtteranceBubble,
  Skeleton,
  SwipeChoice,
  useToast,
} from "@yesman/ui";
import type { Utterance } from "./reducer";
import { useChooseMutation } from "./useDecision";
import { NudgeBanner } from "./NudgeBanner";
import { PersonaThinkingChips } from "./PersonaThinkingChips";
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
}

export function DecisionResult({
  utterances,
  proposal,
  decisionId,
  onComplete,
  onNoChosen,
}: DecisionResultProps) {
  const choose = useChooseMutation();
  const { push } = useToast();
  const [chosen, setChosen] = useState<"yes" | null>(null); // Yes 採択のみ最終 state
  const [noCount, setNoCount] = useState<number>(0);
  // INCEPTION FR-CV-04: 議論を見る default closed、採択後も visible
  const [discussionOpen, setDiscussionOpen] = useState(false);

  const fireConfetti = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    confetti({
      particleCount: 50,
      spread: 80,
      origin: { y: 0.2 },
      colors: ["#9F88C8", "#E8775A", "#FFD6E0"],
      ticks: 150,
      scalar: 1.1,
    });
    // Mobile App Polish §9: Haptic feedback (Android 動作、iOS no-op)
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleChoose = async (choice: "yes" | "no") => {
    if (!decisionId) return;
    try {
      const result = await choose.mutateAsync({ id: decisionId, choice });
      const count = result?.no_attempt_count ?? 0;
      if (choice === "yes") {
        setChosen("yes");
        setNoCount(count);
        fireConfetti();
      } else {
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
      {/* INCEPTION B7: 🔴 LIVE badge during SSE streaming */}
      {isStreaming && (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger text-neutral-0 text-xs font-bold"
            role="status"
            aria-live="polite"
          >
            🔴 LIVE
          </span>
          <span className="text-xs text-neutral-400 italic">
            合議中 (SSE Stream)
          </span>
        </div>
      )}

      {/* Pack A #3: 3 人格 thinking chips (streaming 中のみ表示) */}
      {isStreaming && <PersonaThinkingChips utterances={utterances} />}

      {/* Skeleton bubbles for unreceived utterances during streaming */}
      {isStreaming && utterances.length < 3 && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 - utterances.length }).map((_, i) => (
            <Skeleton key={`utterance-skel-${i}`} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* utterance bubbles (議論を見るで toggle、persona icons は bubble 内蔵) */}
      {showUtterances && (
        <div
          className="flex flex-col gap-2"
          role="region"
          aria-label="議論 (utterance 一覧)"
          id="discussion-region"
        >
          {utterances.map((u, i) => (
            <DecisionUtteranceBubble
              key={`${u.persona_id}-${i}`}
              personaName={u.persona_name}
              text={u.text}
            />
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

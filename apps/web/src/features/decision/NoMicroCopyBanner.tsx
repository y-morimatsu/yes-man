/**
 * NoMicroCopyBanner — INCEPTION drawio Journey C 段階的 No microcopy.
 *
 * C1 No 1回目  → 「別案を生成中…」 (中性)
 * C2 No 2回目  → 「もう一度考えてみては？」 (再考)
 * C3 No 3回目  → 「3回目の No です。 本当にこの選択肢で大丈夫?」 (warning border)
 * C3+ No 5+   → 「ここまで慎重なあなただからこそ、今回は AI に任せてみませんか?」 (Yes 採択への最終支援)
 *
 * drawio 04_NoBurst では段階 heading (「No 1 回目」等) は表示されず、microcopy 本文と
 * 視覚的強度 (border color / divider) で段階を表現する設計. 本実装も heading は廃止し、
 * microcopy + border 強度のみで段階差を伝える.
 *
 * Proposal を妨害せず inline 上部に表示し、別案 (regenerate) 中も持続.
 * Yes 採択時に親側で hide (chosen state へ遷移).
 */
import { t } from "./strings";

export interface NoMicroCopyBannerProps {
  /** 採択済み No 累積回数 (no_attempt_count). 0 のときは render しない. */
  stage: number;
  /** 別案 (regenerate) streaming 中フラグ (loading hint 表示用). */
  regenerating?: boolean;
  /**
   * issue #93: LLM 動的生成された YES nudge microcopy。
   * 指定があれば stage 別の static copy より優先表示 (Yes 採択を後押しする一文)。
   * null は「未到着 or 失敗 → static fallback を使う」を意味する。
   */
  dynamicMessage?: string | null;
}

function copyKey(stage: number):
  | "noStage1Copy"
  | "noStage2Copy"
  | "noStage3Copy"
  | "noStage5PlusFallback" {
  if (stage >= 5) return "noStage5PlusFallback";
  if (stage >= 3) return "noStage3Copy";
  if (stage >= 2) return "noStage2Copy";
  return "noStage1Copy";
}

function borderFor(stage: number): string {
  if (stage >= 3) return "border-warning";
  if (stage >= 2) return "border-silence";
  return "border-neutral-300";
}

export function NoMicroCopyBanner({
  stage,
  regenerating,
  dynamicMessage,
}: NoMicroCopyBannerProps) {
  if (stage <= 0) return null;
  // issue #93: LLM 動的 message を優先、未到着 or 失敗時は static stage copy
  const microcopy = dynamicMessage ?? t(copyKey(stage));
  return (
    <div
      className={`rounded-2xl border-l-4 ${borderFor(stage)} bg-neutral-100 p-3`}
      role="region"
      aria-label={`再考メッセージ: ${microcopy}`}
      data-testid="no-microcopy-banner"
      data-no-attempt-count={stage}
    >
      <p className="font-serif italic text-sm text-neutral-700">{microcopy}</p>
      <p className="mt-1 text-xs text-neutral-400" aria-hidden>
        ・・・・・・・・・・・
      </p>
      {regenerating && (
        <p className="mt-1 text-xs italic text-neutral-500">
          別案を生成中… (LiteLLM 応答待ち)
        </p>
      )}
    </div>
  );
}

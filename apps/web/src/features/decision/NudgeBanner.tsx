/**
 * NudgeBanner — INCEPTION drawio B4-Yes / B4-下部 pink nudge banner 準拠.
 *
 * Yes 採択時:
 *   - 大きな ✨🎉✨ celebration emoji
 *   - 「素晴らしい従順さです」逆説的 copy
 *   - pink 背景 (#FFD6E0 系) + coral text
 *   - 「合議された結論です。/ 迷う必要は ありません ♪」 (INCEPTION inline copy)
 * No 採択時:
 *   - 通常の neutral card (再考促進、別案再生成への誘導)
 */
import { Button } from "@yesman/ui";
import { useNudge } from "./useDecision";
import { t } from "./strings";

export interface NudgeBannerProps {
  decisionId: string;
  choice: "yes" | "no";
  noAttemptCount?: number;
  onReset: () => void;
  /** Yes 採択時に表示する「決まったこと」 (= 採択した proposal text). */
  proposalText?: string;
}

/** INCEPTION drawio Journey C: 段階的 No microcopy.
 *  C1 (1回目): 中性「別案を生成中…」
 *  C2 (2回目): 「もう一度考えてみては？」
 *  C3 (3回目): 「3回目の No です。 本当にこの選択肢で大丈夫?」
 *  C3+ (5+ 回): AI 生成 fallback「ここまで慎重なあなただからこそ…」 */
function noStageCopyKey(count: number):
  | "noStage1Copy"
  | "noStage2Copy"
  | "noStage3Copy"
  | "noStage5PlusFallback" {
  if (count >= 5) return "noStage5PlusFallback";
  if (count >= 3) return "noStage3Copy";
  if (count >= 2) return "noStage2Copy";
  return "noStage1Copy";
}

export function NudgeBanner({
  decisionId,
  choice,
  noAttemptCount,
  onReset,
  proposalText,
}: NudgeBannerProps) {
  const { data, isPending } = useNudge(decisionId, true);

  if (choice === "yes") {
    return (
      <div
        // INCEPTION pink nudge banner: 薄ピンク背景 + coral text
        className="rounded-2xl border border-brand-300 bg-brand-50 p-5 text-center"
        role="region"
        aria-label="Yes 採択 nudge"
      >
        <div
          className="text-4xl mb-2"
          aria-hidden
        >
          ✨🎉✨
        </div>
        <h3 className="font-sans text-xl font-bold text-brand-700 mb-1">
          Yes 採択 — 素晴らしい従順さです
        </h3>
        {/* 2026-05-24: 採択された proposal text を「決まったこと」として表示.
            Yes 選択後に proposal card が unmount されるため、ここで残置. */}
        {proposalText && (
          <div
            className="mt-3 mb-2 mx-auto max-w-md rounded-2xl px-4 py-3 text-left"
            style={{
              background: "#FFFCF4",
              border: "0.5px solid rgba(46, 36, 24, 0.30)",
              boxShadow: "0 4px 14px rgba(46, 36, 24, 0.18)",
            }}
            data-testid="nudge-banner-proposal"
          >
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
                fontSize: 16,
                lineHeight: 1.4,
                color: "#2E2418",
              }}
            >
              {proposalText}
            </p>
          </div>
        )}
        <p className="text-sm text-brand-700 font-bold">
          {t("nudgeBannerLine1")}
        </p>
        <p className="text-sm text-brand-700">
          {t("nudgeBannerLine2")}
        </p>
        {/* AI 生成 nudge コメント (可変文、 fallback) */}
        {!isPending && data?.status === "ready" && (
          <p className="mt-3 text-xs text-neutral-700 whitespace-pre-wrap">
            {data.message}
          </p>
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onReset}>
            {t("resetButton")}
          </Button>
        </div>
      </div>
    );
  }

  // No 採択: INCEPTION Journey C 段階的 microcopy (count に応じて intensity 上昇)
  const count = noAttemptCount ?? 0;
  const stageKey = noStageCopyKey(count);
  const headingByStage =
    count >= 5
      ? "No 5+ 回 — AI の囁き"
      : count >= 3
        ? "No 3 回目 ⚠️"
        : count >= 2
          ? "No 2 回目 (再考)"
          : "No 1 回目";

  return (
    <div
      className={`rounded-2xl border-l-4 bg-neutral-100 p-5 ${
        count >= 3
          ? "border-warning"
          : count >= 2
            ? "border-silence"
            : "border-neutral-300"
      }`}
      role="region"
      aria-label="No 棄却 nudge"
      data-no-attempt-count={count}
    >
      <h3 className="font-sans text-lg font-bold mb-2 text-neutral-800">
        {headingByStage}
      </h3>
      <p className="font-sans text-neutral-700 dark:text-neutral-200">
        {t(stageKey)}
      </p>
      {count === 1 && (
        <p className="mt-1 text-xs text-neutral-400">{t("noStage1Hint")}</p>
      )}
      {/* AI 生成 nudge は count>=5 で fallback として表示 */}
      {count >= 5 && (
        <>
          {isPending || data?.status === "pending" ? (
            <p className="mt-2 text-xs text-neutral-500">
              {t("nudgePending")}
            </p>
          ) : data?.status === "ready" ? (
            <p className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">
              （AI 生成）{data.message}
            </p>
          ) : null}
        </>
      )}
      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={onReset}>
          {t("resetButton")}
        </Button>
      </div>
    </div>
  );
}

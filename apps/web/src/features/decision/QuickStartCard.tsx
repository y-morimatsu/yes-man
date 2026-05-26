/**
 * QuickStartCard — 起動時 idle 状態の YES/NO 質問カード.
 * spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §7 (v3: SwipeChoice 統一)
 *
 * - 操作系 (右スワイプ / 左スワイプ / `Yes →` button / `← No` button / Arrow キー /
 *   haptic feedback / 確定アニメ) は @yesman/ui の SwipeChoice を再利用、
 *   合議結果 (DecisionResult) と完全同一 UX。
 * - title 表示と「自分で入力する」link / NO 進捗 indicator のみ本コンポネ責務。
 * - aria-live="polite" で SR に title 変更通知。
 * - `key={title}` 相当の挙動は親側 (DecisionPage) で QuickStartCard を current.id で
 *   re-key することにより SwipeChoice の confirming/dx 残留を防ぐ。
 */
import { SwipeChoice } from "@yesman/ui";
import { t } from "./strings";

export interface QuickStartCardProps {
  title: string;
  noCount: number;
  onYes: () => void;
  onNo: () => void;
  onSwitchToText: () => void;
}

const NO_LIMIT = 5;

export function QuickStartCard({
  title,
  noCount,
  onYes,
  onNo,
  onSwitchToText,
}: QuickStartCardProps) {
  return (
    <section
      className="rounded-2xl border-2 px-4 py-5 flex flex-col gap-4"
      style={{ borderColor: "#9F88C8", background: "#FFFBF1" }}
      aria-label="クイック質問"
      data-testid="quickstart-card"
    >
      {/* SwipeChoice 内に title card を children として渡す。
          fallback button (← No / Yes →) と Arrow キー操作は SwipeChoice 既存実装. */}
      <SwipeChoice
        proposalText={title}
        onYes={onYes}
        onNo={onNo}
      >
        <div
          className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 px-6 py-8 text-center flex flex-col items-center gap-1 shadow-md"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-3xl" aria-hidden="true">💭</p>
          <p className="font-serif text-xl font-bold text-neutral-900">
            {title}
          </p>
        </div>
      </SwipeChoice>

      <button
        type="button"
        onClick={onSwitchToText}
        data-testid="quickstart-switch-to-text"
        className="
          self-center text-sm italic text-neutral-500 underline underline-offset-4
          hover:text-neutral-700 hover:no-underline
        "
      >
        {t("quickStartSwitchToText")}
      </button>

      {noCount > 0 && noCount < NO_LIMIT && (
        <p
          className="text-center text-[11px] italic text-neutral-400"
          data-testid="quickstart-no-count"
        >
          ▼ NO {noCount} / {NO_LIMIT}
        </p>
      )}
    </section>
  );
}

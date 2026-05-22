/**
 * QuickStartCard — 起動時 idle 状態の YES/NO 質問カード.
 * spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §7
 *
 * - 「{title} してみますか？」を提示、YES で title 確定 / NO で次候補
 * - keyboard shortcut Y / N (active mount 中のみ listen)
 * - aria-live="polite" で title 変更を SR に通知
 */
import { useEffect } from "react";
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
  // Y / N キーボード shortcut. textbox など他 input が active なら無視.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        onYes();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onYes, onNo]);

  return (
    <section
      className="rounded-2xl border-2 px-4 py-5 flex flex-col gap-4"
      style={{ borderColor: "#9F88C8", background: "#FFFBF1" }}
      aria-label="クイック質問"
      data-testid="quickstart-card"
    >
      <div
        className="flex flex-col items-center gap-1 text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-2xl" aria-hidden="true">💭</p>
        <p className="font-serif text-xl font-bold text-neutral-800">
          {title}
        </p>
        <p className="font-serif text-base text-neutral-700">
          {t("quickStartSuffix")}
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={onNo}
          data-testid="quickstart-no"
          className="
            min-h-[48px] min-w-[120px] rounded-xl border-2 px-4 py-2.5
            bg-white text-neutral-700 font-bold text-base
            hover:bg-neutral-50 active:scale-95 transition-transform
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400
          "
          style={{ borderColor: "#C4B8DC" }}
        >
          {t("quickStartNo")}
        </button>
        <button
          type="button"
          onClick={onYes}
          data-testid="quickstart-yes"
          className="
            min-h-[48px] min-w-[120px] rounded-xl px-4 py-2.5
            text-white font-bold text-base
            shadow-[0_4px_12px_rgba(232,119,90,0.3)]
            hover:shadow-[0_6px_16px_rgba(232,119,90,0.4)]
            active:scale-95 transition-transform
            focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E8775A]/40
          "
          style={{ background: "#E8775A" }}
        >
          {t("quickStartYes")}
        </button>
      </div>

      <p className="text-center text-xs text-neutral-500">
        <kbd className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-mono">Y</kbd>{" "}
        = YES /{" "}
        <kbd className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-mono">N</kbd>{" "}
        = NO
      </p>

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

/**
 * YesComboBadge — Yes 連続採択コンボ表示 (Hackathon 差別化 UI).
 *
 * count に応じて文言 + 絵文字 + 色を強化:
 *  - 1: 非表示 (まだ "combo" ではない)
 *  - 2: "2 連 Yes 🔥"
 *  - 3-4: "3 連 Yes 🌟"
 *  - 5-9: "5 連 Yes ⚡"
 *  - 10+: "10 連 Yes 🏆" (overflow なら数値そのまま)
 *
 * combo break (No 採択直後) は別文言 + shake animation で短時間表示し fade out。
 */
import { useEffect } from "react";

export interface YesComboBadgeProps {
  count: number;
  brokeCombo: boolean;
  onBrokeComboShown?: () => void;
}

interface ComboLook {
  emoji: string;
  bg: string;
  text: string;
  border: string;
}

function lookFor(count: number): ComboLook {
  if (count >= 10) {
    return {
      emoji: "🏆",
      bg: "linear-gradient(135deg, #FFD700, #FF8C00)",
      text: "#5C2A00",
      border: "#B45309",
    };
  }
  if (count >= 5) {
    return {
      emoji: "⚡",
      bg: "linear-gradient(135deg, #FBCFE8, #C084FC)",
      text: "#581C87",
      border: "#9333EA",
    };
  }
  if (count >= 3) {
    return {
      emoji: "🌟",
      bg: "linear-gradient(135deg, #FEF3C7, #FCD34D)",
      text: "#7C2D12",
      border: "#D97706",
    };
  }
  return {
    emoji: "🔥",
    bg: "linear-gradient(135deg, #FECACA, #F87171)",
    text: "#7F1D1D",
    border: "#DC2626",
  };
}

export function YesComboBadge({
  count,
  brokeCombo,
  onBrokeComboShown,
}: YesComboBadgeProps) {
  // combo break 演出を 1.4s で fade out
  useEffect(() => {
    if (!brokeCombo) return;
    const t = setTimeout(() => onBrokeComboShown?.(), 1400);
    return () => clearTimeout(t);
  }, [brokeCombo, onBrokeComboShown]);

  if (brokeCombo) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border-2 self-center"
        style={{
          background: "#F3F4F6",
          color: "#6B7280",
          borderColor: "#9CA3AF",
          animation: "ym-combo-break 1.4s ease-out forwards",
        }}
        role="status"
        aria-label="コンボ break"
        data-testid="yes-combo-break"
        data-ym-anim
      >
        <span aria-hidden>💔</span>
        <span>コンボ break</span>
      </div>
    );
  }

  if (count < 2) return null;
  const look = lookFor(count);
  return (
    <div
      key={count} // count 変化のたびに re-animate
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border-2 self-center shadow-sm"
      style={{
        background: look.bg,
        color: look.text,
        borderColor: look.border,
        animation: "ym-combo-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
      }}
      role="status"
      aria-label={`${count} 連 Yes コンボ`}
      data-testid="yes-combo-badge"
      data-ym-combo-count={count}
      data-ym-anim
    >
      <span aria-hidden className="text-base leading-none">
        {look.emoji}
      </span>
      <span>{count} 連 Yes</span>
    </div>
  );
}

/**
 * SwipeChoice — INCEPTION drawio screen-03 完全準拠の swipe Yes/No 選択 UI.
 *
 * ui-mockups.md §1.1: 「スワイプは絶対的な操作。ボタンは存在しない。微細な haptic feedback
 *                      で確定感を演出」
 * drawio screen-03: 「←  No / 別案 再生成」「→ Yes / 承認！」「👆 スワイプして！」
 *
 * 実装:
 * - react-swipeable で touch + mouse gesture を統合検出
 * - onSwipedLeft → onNo / onSwipedRight → onYes (drawio 通り)
 * - drag 中の visual feedback: card が指の動きに追従 (translateX)
 * - threshold = 100px (Pixel 5 width 393 の ~25%) で確定
 * - WCAG 2.5.1 Pointer Gestures: 単一 tap で操作可能な fallback button を併設
 * - haptic feedback: navigator.vibrate(20) で確定時のみ短く振動
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSwipeable } from "react-swipeable";
import { Button } from "../primitives/Button";

export interface SwipeChoiceProps {
  proposalText: string;
  onYes: () => void;
  onNo: () => void;
  disabled?: boolean;
  /** swipe で確定する閾値 (px). default 100. */
  threshold?: number;
  /** 子要素 (proposal card) を渡せる。未指定なら proposalText を中央表示. */
  children?: ReactNode;
}

const SWIPE_THRESHOLD_DEFAULT = 100;
const MAX_DRAG_PX = 200; // visual feedback の最大移動量

function tryHaptic(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      (navigator as Navigator & { vibrate: (p: number | number[]) => boolean })
        .vibrate(20);
    } catch {
      // unsupported environment / iOS Safari: 無視
    }
  }
}

export function SwipeChoice({
  proposalText,
  onYes,
  onNo,
  disabled,
  threshold = SWIPE_THRESHOLD_DEFAULT,
  children,
}: SwipeChoiceProps) {
  const [dx, setDx] = useState(0);
  const [confirming, setConfirming] = useState<"yes" | "no" | null>(null);

  // 防御的 reset: proposalText が変わったら (No 採択後の別案 swap 等で) confirming/dx を初期化.
  // 上位で <SwipeChoice key={decisionId}> が付いていれば本来 instance ごと remount されるが、
  // key 付け忘れの場合のフェイルセーフとして残す.
  const prevProposalRef = useRef(proposalText);
  useEffect(() => {
    if (prevProposalRef.current !== proposalText) {
      prevProposalRef.current = proposalText;
      setDx(0);
      setConfirming(null);
    }
  }, [proposalText]);

  const handlers = useSwipeable({
    onSwiping: ({ deltaX }) => {
      if (disabled || confirming) return;
      const clamped = Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, deltaX));
      setDx(clamped);
    },
    onSwipedLeft: ({ absX }) => {
      if (disabled || confirming) return;
      if (absX < threshold) {
        setDx(0);
        return;
      }
      setConfirming("no");
      setDx(-MAX_DRAG_PX);
      tryHaptic();
      // animation 終了後に callback
      setTimeout(() => onNo(), 180);
    },
    onSwipedRight: ({ absX }) => {
      if (disabled || confirming) return;
      if (absX < threshold) {
        setDx(0);
        return;
      }
      setConfirming("yes");
      setDx(MAX_DRAG_PX);
      tryHaptic();
      setTimeout(() => onYes(), 180);
    },
    onSwiped: () => {
      // 閾値未満で離した時は元の位置に戻る
      if (!confirming) setDx(0);
    },
    trackMouse: true,
    trackTouch: true,
    preventScrollOnSwipe: true,
  });

  const ratio = Math.min(Math.abs(dx) / threshold, 1);
  const rotation = (dx / MAX_DRAG_PX) * 6; // 最大 6deg 回転 (tinder-like)

  return (
    <div
      className="flex flex-col items-center gap-4"
      data-testid="swipe-choice"
      aria-label="提案にスワイプで Yes / No 採択"
    >
      {/* swipe area + drag-following card */}
      <div className="relative w-full">
        {/* 左 No indicator (drag>0 で fade-in) */}
        <span
          aria-hidden
          className="absolute left-2 top-1/2 -translate-y-1/2 select-none text-3xl text-silence font-bold transition-opacity"
          style={{ opacity: dx < 0 ? ratio : 0 }}
        >
          ← No
        </span>
        {/* 右 Yes indicator */}
        <span
          aria-hidden
          className="absolute right-2 top-1/2 -translate-y-1/2 select-none text-3xl text-success font-bold transition-opacity"
          style={{ opacity: dx > 0 ? ratio : 0 }}
        >
          Yes →
        </span>
        {/* swipeable card — role="group" にして fallback Yes/No button との strict mode 衝突を回避.
            keyboard accessible は内部の Yes/No button (Tab focus) で担保. swipe div 上でも
            ArrowLeft/Right が動作するように tabIndex + onKeyDown を残す. */}
        <div
          {...handlers}
          className={`relative mx-auto max-w-utterance touch-pan-y select-none ${confirming ? "transition-transform duration-200 ease-out" : "transition-transform duration-150 ease-out"}`}
          style={{
            transform: `translateX(${dx}px) rotate(${rotation}deg)`,
            cursor: disabled ? "default" : "grab",
          }}
          role="group"
          aria-roledescription="swipeable proposal card"
          tabIndex={0}
          aria-label={`提案カード: ${proposalText}。右へスワイプまたは → で承認、左へスワイプまたは ← で再考。`}
          data-testid="swipe-card"
          onKeyDown={(e) => {
            // キーボード代替: ←/→ で Yes/No (アクセシビリティ)
            if (disabled || confirming) return;
            if (e.key === "ArrowLeft") {
              setConfirming("no");
              setDx(-MAX_DRAG_PX);
              tryHaptic();
              setTimeout(() => onNo(), 180);
            } else if (e.key === "ArrowRight") {
              setConfirming("yes");
              setDx(MAX_DRAG_PX);
              tryHaptic();
              setTimeout(() => onYes(), 180);
            }
          }}
        >
          {children ?? (
            <div className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 p-6 text-center font-serif text-2xl font-bold text-neutral-900 shadow-md">
              {proposalText}
            </div>
          )}
        </div>
      </div>

      {/* スワイプガイド (drawio 中央: 「👆 スワイプして！」) */}
      <p
        className="text-xs italic text-neutral-400"
        aria-hidden
      >
        👆 スワイプして決定
      </p>

      {/* WCAG 2.5.1 fallback buttons (single-pointer alternative) */}
      <div className="flex gap-4">
        <Button
          variant="muted"
          size="lg"
          onClick={() => {
            if (disabled || confirming) return;
            setConfirming("no");
            tryHaptic();
            onNo();
          }}
          disabled={disabled || confirming !== null}
          aria-label="No、提案を拒否"
        >
          ← No
        </Button>
        <Button
          variant="success"
          size="lg"
          onClick={() => {
            if (disabled || confirming) return;
            setConfirming("yes");
            tryHaptic();
            onYes();
          }}
          disabled={disabled || confirming !== null}
          aria-label="Yes、提案を採択"
        >
          Yes →
        </Button>
      </div>
    </div>
  );
}

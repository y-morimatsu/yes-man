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
  /**
   * 「👆 スワイプして決定 → → → Yes」の hint 表示。
   * default true。onboarding 等で連続出題時は false で消すと UI がすっきり。
   */
  showSwipeHint?: boolean;
  /**
   * 2026-05-26 drill-down-auto-open (FR-DAO-09): Yes confirm 直後、`onYes` の
   * `setTimeout(180ms)` の **前** に同期実行される callback. user gesture chain 内での
   * 副作用 (例: `window.open`) に使用. 3 Yes path (right-swipe / fallback button click /
   * ArrowRight) すべてで発火.
   *
   * 例外を投げても `onYes` は呼ばれる (try-catch で保護). 副作用のみに留めること.
   */
  onYesSync?: () => void;
  /**
   * 2026-05-26 drill-down-auto-open (NFR-DAO-10): Yes button の aria-label を override.
   * 未指定なら default "Yes、提案を採択".
   * isFinal + service 時に "Yes、提案を採択 (新しいタブで XXX を開きます)" 等を渡し、
   * スクリーンリーダー利用者に「Yes 押下 = 外部遷移」を事前通知.
   */
  yesAriaLabelOverride?: string;
  /**
   * 2026-05-29 4方向スワイプ: 下スワイプ (= もっと絞る / 深掘り). 未指定で無効 (final 段等).
   */
  onDown?: () => void;
  /** 下スワイプの hint / indicator ラベル. default "もっと絞る". */
  downLabel?: string;
  /**
   * 2026-05-29 4方向スワイプ: 上スワイプ (= 中断 / やめる). 未指定で無効.
   */
  onUp?: () => void;
  /** 上スワイプの hint / indicator ラベル. default "やめる". */
  upLabel?: string;
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
  showSwipeHint = true,
  onYesSync,
  yesAriaLabelOverride,
  onDown,
  downLabel = "もっと絞る",
  onUp,
  upLabel = "やめる",
}: SwipeChoiceProps) {
  // 2026-05-26 (FR-DAO-09): user gesture chain 内同期発火 helper.
  // 3 Yes path で onYes より前に呼ぶ:
  //   - swipe / keyboard path: setTimeout(onYes, 180) の前
  //   - fallback button click path: onYes() の直前 (button click 自体は同期)
  // 例外は握り潰し、onYes の発火を阻害しない (try/catch).
  const invokeYesSync = (): void => {
    if (!onYesSync) return;
    try {
      onYesSync();
    } catch {
      // popup block / DOM error 等は CTA fallback (NFR-DAO-01) で復帰
    }
  };
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [confirming, setConfirming] = useState<"yes" | "no" | "up" | "down" | null>(
    null,
  );

  // 防御的 reset: proposalText が変わったら (No 採択後の別案 swap 等で) confirming/dx を初期化.
  // 上位で <SwipeChoice key={decisionId}> が付いていれば本来 instance ごと remount されるが、
  // key 付け忘れの場合のフェイルセーフとして残す.
  const prevProposalRef = useRef(proposalText);
  useEffect(() => {
    if (prevProposalRef.current !== proposalText) {
      prevProposalRef.current = proposalText;
      setDx(0);
      setDy(0);
      setConfirming(null);
    }
  }, [proposalText]);

  const clamp = (v: number) => Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, v));

  const handlers = useSwipeable({
    onSwiping: ({ deltaX, deltaY }) => {
      if (disabled || confirming) return;
      // 主軸判定: 横移動が縦以上なら左右ドラッグ、そうでなければ上下ドラッグ.
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        setDx(clamp(deltaX));
        setDy(0);
      } else {
        setDy(clamp(deltaY));
        setDx(0);
      }
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
      // 2026-05-27: iPhone Safari popup blocker 回避のため window.open を
      // setState / vibrate / setTimeout より **前** に発火.
      invokeYesSync();
      setConfirming("yes");
      setDx(MAX_DRAG_PX);
      tryHaptic();
      setTimeout(() => onYes(), 180);
    },
    onSwipedDown: ({ absY }) => {
      // 2026-05-29: 下スワイプ = もっと絞る (深掘り). onDown 未指定なら無効.
      if (disabled || confirming || !onDown) {
        setDy(0);
        return;
      }
      if (absY < threshold) {
        setDy(0);
        return;
      }
      setConfirming("down");
      setDy(MAX_DRAG_PX);
      tryHaptic();
      setTimeout(() => onDown(), 180);
    },
    onSwipedUp: ({ absY }) => {
      // 2026-05-29: 上スワイプ = 中断 (やめる). onUp 未指定なら無効.
      if (disabled || confirming || !onUp) {
        setDy(0);
        return;
      }
      if (absY < threshold) {
        setDy(0);
        return;
      }
      setConfirming("up");
      setDy(-MAX_DRAG_PX);
      tryHaptic();
      setTimeout(() => onUp(), 180);
    },
    onSwiped: () => {
      // 閾値未満で離した時は元の位置に戻る
      if (!confirming) {
        setDx(0);
        setDy(0);
      }
    },
    trackMouse: true,
    trackTouch: true,
    preventScrollOnSwipe: true,
  });

  const ratio = Math.min(Math.abs(dx) / threshold, 1);
  const ratioY = Math.min(Math.abs(dy) / threshold, 1);
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
        {/* 上 中断 indicator (drag<0 で fade-in、onUp 有効時のみ) */}
        {onUp && (
          <span
            aria-hidden
            className="absolute left-1/2 top-1 -translate-x-1/2 select-none text-lg font-bold text-silence transition-opacity"
            style={{ opacity: dy < 0 ? ratioY : 0 }}
          >
            ↑ {upLabel}
          </span>
        )}
        {/* 下 深掘り indicator (drag>0 で fade-in、onDown 有効時のみ) */}
        {onDown && (
          <span
            aria-hidden
            className="absolute left-1/2 bottom-1 -translate-x-1/2 select-none text-lg font-bold transition-opacity"
            style={{ opacity: dy > 0 ? ratioY : 0, color: "#3A66B5" }}
          >
            ↓ {downLabel}
          </span>
        )}
        {/* swipeable card — role="group" にして fallback Yes/No button との strict mode 衝突を回避.
            keyboard accessible は内部の Yes/No button (Tab focus) で担保. swipe div 上でも
            ArrowLeft/Right が動作するように tabIndex + onKeyDown を残す. */}
        <div
          {...handlers}
          // FE-DESIGN-06: motion vocabulary 'fast' (150ms / ease-out) 統一
          // Hackathon: dx=0 (未スワイプ) の時に右辺グロー pulse で Yes 方向を passive 誘導
          className="relative mx-auto max-w-utterance touch-pan-y select-none transition-transform duration-150 ease-out rounded-2xl"
          style={{
            transform: `translateX(${dx}px) translateY(${dy}px) rotate(${rotation}deg)`,
            cursor: disabled ? "default" : "grab",
            animation:
              !disabled && !confirming && dx === 0
                ? "ym-yes-edge-glow 2.2s ease-in-out infinite"
                : undefined,
          }}
          data-ym-anim
          role="group"
          aria-roledescription="swipeable proposal card"
          tabIndex={0}
          aria-label={`提案カード: ${proposalText}。右へスワイプまたは → で決定、左へスワイプまたは ← で別案${
            onDown ? "、下へスワイプまたは ↓ でもっと絞る" : ""
          }${onUp ? "、上へスワイプまたは ↑ でやめる" : ""}。`}
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
              // FR-DAO-09: setTimeout の前に同期発火
              invokeYesSync();
              setTimeout(() => onYes(), 180);
            } else if (e.key === "ArrowDown" && onDown) {
              setConfirming("down");
              setDy(MAX_DRAG_PX);
              tryHaptic();
              setTimeout(() => onDown(), 180);
            } else if (e.key === "ArrowUp" && onUp) {
              setConfirming("up");
              setDy(-MAX_DRAG_PX);
              tryHaptic();
              setTimeout(() => onUp(), 180);
            }
          }}
        >
          {children ?? (
            <div className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 p-6 text-center font-sans text-2xl font-bold text-neutral-900 shadow-md">
              {proposalText}
            </div>
          )}
        </div>
      </div>

      {/* スワイプガイド: Hackathon で右方向 (Yes) を marching arrow で誘導.
          dx=0 (未スワイプ) の間のみアニメ表示、スワイプ開始で hide. */}
      {showSwipeHint && dx === 0 && !confirming && (
        <div
          className="flex items-center gap-2 text-xs text-neutral-500"
          aria-hidden
          data-testid="swipe-hint-right"
          data-ym-anim
        >
          <span>👆 スワイプして決定</span>
          <span className="flex items-center gap-0.5 font-bold text-success">
            <span
              style={{ animation: "ym-swipe-hint-arrow 1.4s ease-in-out infinite", animationDelay: "0s" }}
              className="inline-block"
            >
              →
            </span>
            <span
              style={{ animation: "ym-swipe-hint-arrow 1.4s ease-in-out infinite", animationDelay: "0.2s" }}
              className="inline-block"
            >
              →
            </span>
            <span
              style={{ animation: "ym-swipe-hint-arrow 1.4s ease-in-out infinite", animationDelay: "0.4s" }}
              className="inline-block"
            >
              →
            </span>
            <span className="ml-1">Yes</span>
          </span>
        </div>
      )}

      {/* 上下スワイプの hint (有効時のみ): スワイプ主体 + ヒントで発見性を補う */}
      {(onDown || onUp) && dx === 0 && dy === 0 && !confirming && (
        <div
          className="flex items-center gap-3 text-[11px] text-neutral-400"
          aria-hidden
          data-testid="swipe-hint-vertical"
        >
          {onDown && (
            <span className="flex items-center gap-0.5">
              <span style={{ color: "#3A66B5" }}>↓</span> {downLabel}
            </span>
          )}
          {onUp && (
            <span className="flex items-center gap-0.5">
              <span className="text-silence">↑</span> {upLabel}
            </span>
          )}
        </div>
      )}

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
            // 2026-05-27: iPhone Safari の popup blocker が user gesture chain を
            // 厳しく評価するため、window.open は click handler の **最初**
            // (setState / vibrate より前) に発火する. setState / vibrate が先に
            // 走ると Safari が「直接の click 結果ではない」と判断して popup を block.
            invokeYesSync();
            setConfirming("yes");
            tryHaptic();
            onYes();
          }}
          disabled={disabled || confirming !== null}
          aria-label={yesAriaLabelOverride ?? "Yes、提案を採択"}
        >
          Yes →
        </Button>
      </div>
    </div>
  );
}

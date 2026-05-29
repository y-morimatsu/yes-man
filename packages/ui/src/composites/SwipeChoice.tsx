/**
 * SwipeChoice — カードスワイプ 4方向 選択 UI (2026-05-29 案E確定版).
 *
 * ui-mockups.md §1.1: 「スワイプは絶対的な操作。ボタンは存在しない。微細な haptic feedback
 *                      で確定感を演出」
 *
 * 実装 (2026-05-29 案E: 塗りボタン廃止 + カード四辺ラベル):
 * - react-swipeable で touch + mouse gesture を統合検出 (4方向)
 * - 右=Yes(決定) / 左=No(別案) / 下=onDown(もっと絞る) / 上=onUp(やめる)
 * - drag 中の visual feedback: card が指の動きに追従 (translateX / translateY)
 * - threshold = 100px で確定
 * - WCAG 2.5.1 Pointer Gestures: 四辺ラベルは「塗りなしの button」でタップ代替を担保
 *   (見た目はラベル、機能はボタン)。キーボード (←→↑↓) も代替。
 * - 右 Yes 方向に → → → marching 矢印アニメ (未スワイプ時のみ) で誘導
 * - haptic feedback: navigator.vibrate(20) で確定時のみ短く振動
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSwipeable } from "react-swipeable";

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
   * Yes 方向の「→ → →」marching 矢印ヒント表示。
   * default true。onboarding 等で連続出題時は false で消すと UI がすっきり。
   */
  showSwipeHint?: boolean;
  /**
   * 2026-05-26 drill-down-auto-open (FR-DAO-09): Yes confirm 直後、`onYes` の
   * `setTimeout(180ms)` の **前** に同期実行される callback. user gesture chain 内での
   * 副作用 (例: `window.open`) に使用. swipe / tap / ArrowRight すべてで発火.
   *
   * 例外を投げても `onYes` は呼ばれる (try-catch で保護). 副作用のみに留めること.
   */
  onYesSync?: () => void;
  /**
   * 2026-05-26 drill-down-auto-open (NFR-DAO-10): Yes の aria-label を override.
   * 未指定なら default "Yes、提案を採択".
   */
  yesAriaLabelOverride?: string;
  /**
   * 2026-05-29 4方向: 下スワイプ (= もっと絞る / 深掘り). 未指定で無効 (final 段等).
   */
  onDown?: () => void;
  /** 下ラベル. default "もっと絞る". */
  downLabel?: string;
  /**
   * 2026-05-29 4方向: 上スワイプ (= 中断 / やめる). 未指定で無効.
   */
  onUp?: () => void;
  /** 上ラベル. default "やめる". */
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

  // 防御的 reset: proposalText が変わったら (No 採択後の別案 swap 等で) 初期化.
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

  // === 確定アクション (swipe / tap / keyboard 共通) ===
  // immediate=true (tap): callback を同期発火 (反応即時 + iOS popup chain 維持).
  // immediate=false (swipe/keyboard): drag アニメ後 180ms で発火.
  const fireYes = (immediate = false) => {
    if (disabled || confirming) return;
    invokeYesSync(); // iOS Safari popup blocker 回避: window.open は最初に
    setConfirming("yes");
    setDx(MAX_DRAG_PX);
    tryHaptic();
    if (immediate) onYes();
    else setTimeout(() => onYes(), 180);
  };
  const fireNo = (immediate = false) => {
    if (disabled || confirming) return;
    setConfirming("no");
    setDx(-MAX_DRAG_PX);
    tryHaptic();
    if (immediate) onNo();
    else setTimeout(() => onNo(), 180);
  };
  const fireDown = (immediate = false) => {
    if (disabled || confirming || !onDown) return;
    setConfirming("down");
    setDy(MAX_DRAG_PX);
    tryHaptic();
    if (immediate) onDown();
    else setTimeout(() => onDown(), 180);
  };
  const fireUp = (immediate = false) => {
    if (disabled || confirming || !onUp) return;
    setConfirming("up");
    setDy(-MAX_DRAG_PX);
    tryHaptic();
    if (immediate) onUp();
    else setTimeout(() => onUp(), 180);
  };

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
      fireNo();
    },
    onSwipedRight: ({ absX }) => {
      if (disabled || confirming) return;
      if (absX < threshold) {
        setDx(0);
        return;
      }
      fireYes();
    },
    onSwipedDown: ({ absY }) => {
      if (disabled || confirming || !onDown) {
        setDy(0);
        return;
      }
      if (absY < threshold) {
        setDy(0);
        return;
      }
      fireDown();
    },
    onSwipedUp: ({ absY }) => {
      if (disabled || confirming || !onUp) {
        setDy(0);
        return;
      }
      if (absY < threshold) {
        setDy(0);
        return;
      }
      fireUp();
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

  const rotation = (dx / MAX_DRAG_PX) * 6; // 最大 6deg 回転 (tinder-like)
  const idle = dx === 0 && dy === 0 && !confirming;

  // 四辺ラベル (塗りなし button): 見た目はラベル、機能はタップ可能 (WCAG 2.5.1).
  const sideLabelBase =
    "flex flex-col items-center justify-center select-none bg-transparent border-0 p-0 leading-tight";

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-testid="swipe-choice"
      aria-label="提案にスワイプで Yes / No / もっと絞る / やめる"
    >
      {/* 上: ↑ やめる (onUp 有効時のみ) */}
      {onUp && (
        <button
          type="button"
          onClick={() => fireUp(true)}
          disabled={disabled || confirming !== null}
          className={`${sideLabelBase} text-[12px] font-bold text-silence disabled:opacity-40`}
          aria-label={`やめる (上へスワイプまたは ↑)`}
          data-testid="swipe-up"
        >
          <span aria-hidden>↑ {upLabel}</span>
        </button>
      )}

      {/* 中段: [← No] [カード] [Yes →] */}
      <div className="flex w-full items-stretch justify-center gap-1">
        {/* 左: ← No */}
        <button
          type="button"
          onClick={() => fireNo(true)}
          disabled={disabled || confirming !== null}
          className={`${sideLabelBase} shrink-0 w-12 text-silence disabled:opacity-40`}
          aria-label="No、別案を再生成"
          data-testid="swipe-no"
        >
          <span aria-hidden className="text-sm font-bold">No</span>
          {/* No 文字の下に ←←← marching (左流れ、Yes の →→→ と対称) */}
          {showSwipeHint && idle && (
            <span
              aria-hidden
              className="mt-0.5 flex items-center text-[11px] font-bold"
              data-testid="swipe-hint-left"
            >
              {/* 右端の ← が先に流れるよう delay を 0.4/0.2/0 で逆順 → 右→左の波 */}
              {[0.4, 0.2, 0].map((delay, i) => (
                <span
                  key={i}
                  className="inline-block"
                  style={{
                    animation: `ym-swipe-hint-arrow-left 1.4s ease-in-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                >
                  ←
                </span>
              ))}
            </span>
          )}
        </button>

        {/* 中央: swipeable card (drag-following) */}
        <div className="relative flex-1 min-w-0 max-w-utterance">
          <div
            {...handlers}
            className="touch-pan-y select-none transition-transform duration-150 ease-out rounded-2xl"
            style={{
              transform: `translateX(${dx}px) translateY(${dy}px) rotate(${rotation}deg)`,
              cursor: disabled ? "default" : "grab",
              animation: !disabled && idle
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
              if (disabled || confirming) return;
              if (e.key === "ArrowLeft") fireNo();
              else if (e.key === "ArrowRight") fireYes();
              else if (e.key === "ArrowDown" && onDown) fireDown();
              else if (e.key === "ArrowUp" && onUp) fireUp();
            }}
          >
            {children ?? (
              <div className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 p-6 text-center font-sans text-2xl font-bold text-neutral-900 shadow-md">
                {proposalText}
              </div>
            )}
          </div>
        </div>

        {/* 右: Yes → + → → → marching アニメ */}
        <button
          type="button"
          onClick={() => fireYes(true)}
          disabled={disabled || confirming !== null}
          className={`${sideLabelBase} shrink-0 w-14 text-success disabled:opacity-40`}
          aria-label={yesAriaLabelOverride ?? "Yes、提案を採択"}
          data-testid="swipe-yes"
        >
          <span aria-hidden className="text-sm font-bold">Yes</span>
          {/* 未スワイプ時のみ → → → marching でYes方向を誘導 */}
          {showSwipeHint && idle && (
            <span
              aria-hidden
              className="mt-0.5 flex items-center text-[11px] font-bold"
              data-testid="swipe-hint-right"
              data-ym-anim
            >
              {[0, 0.2, 0.4].map((delay, i) => (
                <span
                  key={i}
                  className="inline-block"
                  style={{
                    animation: `ym-swipe-hint-arrow 1.4s ease-in-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                >
                  →
                </span>
              ))}
            </span>
          )}
        </button>
      </div>

      {/* 下: ↓ もっと絞る (onDown 有効時のみ) */}
      {onDown && (
        <button
          type="button"
          onClick={() => fireDown(true)}
          disabled={disabled || confirming !== null}
          className={`${sideLabelBase} text-[12px] font-bold disabled:opacity-40`}
          style={{ color: "#3A66B5" }}
          aria-label="もっと絞る (下へスワイプまたは ↓)"
          data-testid="swipe-down"
        >
          <span aria-hidden>↓ {downLabel}</span>
        </button>
      )}
    </div>
  );
}

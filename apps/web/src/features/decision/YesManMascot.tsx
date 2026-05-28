/**
 * YesManMascot — 画面右下 fixed に出る小さなマスコット (ハッカソン差別化).
 *
 * 状況に応じて speech bubble を表示し、Yes 採択を後押しする。
 * state は親から受け取る (idle / streaming / proposing / yes / no / silenced)。
 *
 * design:
 * - position: fixed bottom-right (z-index high、SwipeChoice や Modal を妨害しない)
 * - mascot: 🤵 (絵文字、追加 asset 不要、ハッカソン速度優先)
 * - bobbing animation (gentle vertical float)
 * - speech bubble: pop-in animation、state 変化で content も切替
 * - prefers-reduced-motion: reduce で animation 無効化 (CSS globals.css 経由)
 */

export type MascotState =
  | "hidden"
  | "streaming"
  | "proposing"
  | "yes"
  | "no"
  | "silenced";

interface MascotLook {
  message: string;
  bubbleBg: string;
  bubbleBorder: string;
  bubbleText: string;
}

const LOOKS: Record<Exclude<MascotState, "hidden">, MascotLook> = {
  streaming: {
    message: "じっくり 考え中…",
    bubbleBg: "#FEF3C7",
    bubbleBorder: "#FCD34D",
    bubbleText: "#92400E",
  },
  proposing: {
    message: "迷ったら 任せて!",
    bubbleBg: "#FDF2F8",
    bubbleBorder: "#FBCFE8",
    bubbleText: "#9D174D",
  },
  yes: {
    message: "やった! いいね!",
    bubbleBg: "#ECFDF5",
    bubbleBorder: "#86EFAC",
    bubbleText: "#065F46",
  },
  no: {
    message: "次は うまくいくよ!",
    bubbleBg: "#F3F4F6",
    bubbleBorder: "#9CA3AF",
    bubbleText: "#374151",
  },
  silenced: {
    message: "あなたが 決める領域",
    bubbleBg: "#1A2329",
    bubbleBorder: "#455A64",
    bubbleText: "#90A4AE",
  },
};

export interface YesManMascotProps {
  state: MascotState;
}

export function YesManMascot({ state }: YesManMascotProps) {
  if (state === "hidden") return null;
  const look = LOOKS[state];

  return (
    <div
      className="fixed top-2 right-3 z-50 flex items-start gap-2 pointer-events-none"
      role="status"
      aria-label={`YesMan: ${look.message}`}
      data-testid="yesman-mascot"
      data-ym-mascot-state={state}
    >
      {/* speech bubble (mascot の左側、tail は右向き) */}
      <div
        key={state} // state 変化のたびに pop-in 再生
        className="relative max-w-[14rem] rounded-2xl border-2 px-3 py-2 text-xs font-bold shadow-sm mt-2"
        style={{
          background: look.bubbleBg,
          borderColor: look.bubbleBorder,
          color: look.bubbleText,
          animation: "ym-mascot-bubble-in 240ms ease-out both",
        }}
        data-ym-anim
      >
        {look.message}
        {/* speech tail (右向き三角、bubble の右上から mascot に向かう) */}
        <span
          aria-hidden
          className="absolute -right-2 top-2 w-0 h-0"
          style={{
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderLeft: `8px solid ${look.bubbleBorder}`,
          }}
        />
        <span
          aria-hidden
          className="absolute -right-[6px] top-[9px] w-0 h-0"
          style={{
            borderTop: "4px solid transparent",
            borderBottom: "4px solid transparent",
            borderLeft: `6px solid ${look.bubbleBg}`,
          }}
        />
      </div>

      {/* mascot (絵文字、bobbing animation) — 右 */}
      <div
        aria-hidden
        className="text-4xl select-none"
        style={{ animation: "ym-mascot-bob 2.4s ease-in-out infinite" }}
        data-ym-anim
      >
        🤵
      </div>
    </div>
  );
}

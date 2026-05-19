/**
 * VoiceMicButton — composite (FD §4.4 + ultrathink Imp2 state machine).
 *
 * Toggle 方式: idle/error → クリックで recording 開始、recording → クリックで stop.
 * push-to-talk は PC マウスでの操作互換性が悪いため非採用 (Toggle のみ).
 *
 * state machine:
 *   idle ──(click)──▶ recording ──(click)──▶ processing ──(success)──▶ idle
 *                                              └──(failure)──▶ error ──(click)──▶ idle
 */
import { Button } from "../primitives/Button";
import { MicIcon } from "../icons/MicIcon";

export type VoiceMicState = "idle" | "recording" | "processing" | "error";

export interface VoiceMicButtonProps {
  state: VoiceMicState;
  /** Toggle: idle/error 時のクリックで開始、recording 時のクリックで停止. */
  onClick: () => void;
  errorMessage?: string;
}

const LABELS: Record<VoiceMicState, string> = {
  idle: "話す",
  recording: "録音中... (クリックで停止)",
  processing: "処理中...",
  error: "再試行",
};

export function VoiceMicButton({
  state,
  onClick,
  errorMessage,
}: VoiceMicButtonProps) {
  const variant =
    state === "recording" ? "danger" : state === "error" ? "secondary" : "primary";

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={variant}
        size="lg"
        onClick={onClick}
        loading={state === "processing"}
        aria-label={LABELS[state]}
        aria-pressed={state === "recording"}
      >
        <MicIcon className="h-5 w-5" />
        <span>{LABELS[state]}</span>
      </Button>
      {state === "error" && errorMessage && (
        <p className="text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

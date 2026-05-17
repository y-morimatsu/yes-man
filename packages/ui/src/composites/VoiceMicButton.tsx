/**
 * VoiceMicButton — composite (FD §4.4 + ultrathink Imp2 state machine).
 *
 * state machine (U6 voice flow と整合):
 *   idle ──(user click)──▶ recording
 *    ▲                          │ (user stop / max duration timeout)
 *    │                          ▼
 *    │                      processing (STT API call)
 *    │                          │
 *    │                          ├──(success)──▶ idle (caller が text を受領)
 *    │                          └──(failure)──▶ error
 *    │                                           │ (click "再試行")
 *    └─────────────────────────────────────────────
 */
import { Button } from "../primitives/Button";
import { MicIcon } from "../icons/MicIcon";

export type VoiceMicState = "idle" | "recording" | "processing" | "error";

export interface VoiceMicButtonProps {
  state: VoiceMicState;
  onClick: () => void;
  errorMessage?: string;
}

const LABELS: Record<VoiceMicState, string> = {
  idle: "話す",
  recording: "録音中...",
  processing: "処理中...",
  error: "再試行",
};

export function VoiceMicButton({ state, onClick, errorMessage }: VoiceMicButtonProps) {
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

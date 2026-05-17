/**
 * VoiceMicInput — VoiceMicButton wrapper、転写完了で onTranscript callback.
 *
 * ultrathink U7d Code Gen Plan Imp2: voice は optional addition、text input が default.
 */
import { useEffect } from "react";
import { VoiceMicButton } from "@yesman/ui";
import { useVoiceInput } from "./useVoiceInput";

export interface VoiceMicInputProps {
  onTranscript: (text: string) => void;
}

export function VoiceMicInput({ onTranscript }: VoiceMicInputProps) {
  const { state, transcript, errorMessage, start, stop } = useVoiceInput();

  // 転写完了時に caller に通知
  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  const handleClick = () => {
    if (state === "recording") {
      void stop();
    } else {
      void start();
    }
  };

  return (
    <VoiceMicButton
      state={state}
      onClick={handleClick}
      errorMessage={errorMessage ?? undefined}
    />
  );
}

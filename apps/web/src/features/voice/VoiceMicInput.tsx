/**
 * VoiceMicInput — VoiceMicButton wrapper、転写完了で onTranscript callback.
 *
 * UX: Toggle 方式. クリック → 録音開始、もう一度クリック → 停止 (PC / モバイル両対応).
 */
import { useEffect, useRef } from "react";
import { VoiceMicButton } from "@yesman/ui";
import { useVoiceInput } from "./useVoiceInput";

export interface VoiceMicInputProps {
  onTranscript: (text: string) => void;
}

export function VoiceMicInput({ onTranscript }: VoiceMicInputProps) {
  const { state, transcript, errorMessage, start, stop } = useVoiceInput();

  // onTranscript は親で inline 関数渡しになりがちで毎レンダ新参照 → useEffect 依存に
  // 入れると無限ループになるため、ref で常に最新を保持して useEffect の依存からは外す.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // transcript.nonce が変化するたびに親に通知 (同じ text の連続発話でも nonce 必ず増)
  useEffect(() => {
    if (transcript.text) {
      onTranscriptRef.current(transcript.text);
    }
  }, [transcript]);

  const handleClick = () => {
    if (state === "recording") {
      void stop();
    } else if (state === "idle" || state === "error") {
      void start();
    }
    // processing 中は何もしない (STT 応答待ち)
  };

  return (
    <VoiceMicButton
      state={state}
      onClick={handleClick}
      errorMessage={errorMessage ?? undefined}
    />
  );
}

/**
 * useVoiceInput — Voice backend を切り替えて音声入力を提供する wrapper hook.
 *
 * 内部では常に 2 つの hook を初期化 (React hooks rules を守る):
 *   - useServerVoiceInput  : MediaRecorder で録音 → POST /v1/voice/stt (AWS / mock)
 *   - useWebSpeechRecognition : ブラウザ内蔵 SpeechRecognition (オフライン、即時)
 *
 * user の選択 (useVoiceBackend, localStorage で永続化) に応じて返す hook を切替.
 */
import { useCallback, useRef, useState } from "react";
import { useApi } from "../../shell/ApiProvider";
import { useVoiceConfig } from "./useVoiceConfig";
import { useVoiceBackend } from "./useVoiceBackend";
import { useWebSpeechRecognition } from "./useWebSpeechRecognition";
import { t } from "./strings";

export type VoiceMicState = "idle" | "recording" | "processing" | "error";

interface TranscriptEvent {
  text: string;
  /** 同じ text が連続しても useEffect を発火させるための単調増加 nonce. */
  nonce: number;
}

interface VoiceInput {
  state: VoiceMicState;
  transcript: TranscriptEvent;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

/** Server STT 経路 (MediaRecorder + /v1/voice/stt、既存実装). */
function useServerVoiceInput(): VoiceInput {
  const api = useApi();
  const { data: voiceConfig } = useVoiceConfig();
  const [state, setState] = useState<VoiceMicState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEvent>({ text: "", nonce: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    if (!voiceConfig) {
      setErrorMessage(t("errorUnsupported"));
      setState("error");
      return;
    }
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        try {
          const result = await api.voice.stt(blob, "audio/webm", "ja-JP");
          setTranscript((prev) => ({ text: result.text, nonce: prev.nonce + 1 }));
          setState("idle");
        } catch (err) {
          setErrorMessage(String(err));
          setState("error");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setErrorMessage(t("errorPermission"));
      setState("error");
    }
  }, [api, voiceConfig]);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setTranscript((prev) => ({ text: "", nonce: prev.nonce + 1 }));
    setErrorMessage(null);
  }, []);

  return { state, transcript, errorMessage, start, stop, reset };
}

/** 公開 hook: user backend に応じて Server STT / Web Speech API を選択. */
export function useVoiceInput(): VoiceInput {
  const { backend } = useVoiceBackend();
  // React hooks rules を守るため、両方の hook を常に呼び出す
  const server = useServerVoiceInput();
  const webSpeech = useWebSpeechRecognition();
  return backend === "web-speech-api" ? webSpeech : server;
}

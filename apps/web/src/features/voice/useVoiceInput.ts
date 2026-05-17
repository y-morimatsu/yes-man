/**
 * useVoiceInput — MediaRecorder + STT API or Web Speech API (U7d FD §8).
 *
 * backend (aws/web-speech-api/mock) を useVoiceConfig で判定、適切な経路で録音 + 転写.
 */
import { useCallback, useRef, useState } from "react";
import { useApi } from "../../shell/ApiProvider";
import { useVoiceConfig } from "./useVoiceConfig";
import { t } from "./strings";

export type VoiceMicState = "idle" | "recording" | "processing" | "error";

interface VoiceInput {
  state: VoiceMicState;
  transcript: string;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useVoiceInput(): VoiceInput {
  const api = useApi();
  const { data: voiceConfig } = useVoiceConfig();
  const [state, setState] = useState<VoiceMicState>("idle");
  const [transcript, setTranscript] = useState("");
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

    if (voiceConfig.backend === "web-speech-api") {
      // Web Speech API は browser-native、ここでは MVP の placeholder.
      // 本格実装は別 hook (useWebSpeechRecognition) で.
      setErrorMessage(t("clientOnlyHint"));
      setState("error");
      return;
    }

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
          setTranscript(result.text);
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
    setTranscript("");
    setErrorMessage(null);
  }, []);

  return { state, transcript, errorMessage, start, stop, reset };
}

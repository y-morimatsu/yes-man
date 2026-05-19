/**
 * useVoiceBackend — ユーザが選択した音声入力 backend を localStorage で永続化。
 *
 * - "web-speech-api" : ブラウザ内蔵 SpeechRecognition (オフライン、即時 transcript)
 * - "server"         : サーバ STT (VOICE_BACKEND=aws or mock の経路、MediaRecorder + /v1/voice/stt)
 *
 * default は "web-speech-api" (実音声を返せるため、デモ向け)。
 * Web Speech API 非対応ブラウザの場合は自動で "server" にフォールバック。
 */
import { useCallback, useEffect, useState } from "react";

export type VoiceUserBackend = "web-speech-api" | "server";

const STORAGE_KEY = "yesman.voice.backend";
const DEFAULT_BACKEND: VoiceUserBackend = "web-speech-api";

function isWebSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition,
  );
}

function readBackend(): VoiceUserBackend {
  if (typeof window === "undefined") return DEFAULT_BACKEND;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "web-speech-api" || stored === "server") {
    // Web Speech API 非対応ブラウザに保存値が残っている場合は自動 fallback
    if (stored === "web-speech-api" && !isWebSpeechSupported()) return "server";
    return stored;
  }
  return isWebSpeechSupported() ? DEFAULT_BACKEND : "server";
}

export function useVoiceBackend(): {
  backend: VoiceUserBackend;
  setBackend: (b: VoiceUserBackend) => void;
  webSpeechSupported: boolean;
} {
  const [backend, setBackendState] = useState<VoiceUserBackend>(() => readBackend());
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);

  // SSR セーフ: mount 後に Web Speech support を判定
  useEffect(() => {
    setWebSpeechSupported(isWebSpeechSupported());
  }, []);

  const setBackend = useCallback((b: VoiceUserBackend) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, b);
    }
    setBackendState(b);
  }, []);

  // 別タブで変更された場合の同期
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (e.newValue === "web-speech-api" || e.newValue === "server") {
          setBackendState(e.newValue);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { backend, setBackend, webSpeechSupported };
}

/**
 * useWebSpeechRecognition — ブラウザ内蔵 Web Speech API ベースの音声認識 hook.
 *
 * useVoiceInput と同 interface ({ state, transcript, errorMessage, start, stop, reset })。
 * サーバ呼び出しなし、Chrome / Edge / Safari 14.1+ で動作 (Firefox 不可)。
 * interimResults=true で発話中のリアルタイム表示にも対応するが、最終的に isFinal を採用。
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceMicState = "idle" | "recording" | "processing" | "error";

// SpeechRecognition は標準型に未定義のため最小限の型を定義
interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }> & { length: number };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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

export function useWebSpeechRecognition(): VoiceInput {
  const [state, setState] = useState<VoiceMicState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEvent>({ text: "", nonce: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // 発話中の interim + final を蓄積する ref (state 更新せず re-render を起こさない).
  // push-to-talk で stop() が isFinal より早く呼ばれても、最後の interim を最終 transcript として採用.
  const accumulatedRef = useRef("");

  const start = useCallback(async () => {
    setErrorMessage(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setErrorMessage(
        "お使いのブラウザは Web Speech API に対応していません (Chrome / Edge / Safari 14.1+ をお試しください)",
      );
      setState("error");
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = "ja-JP";
      // push-to-talk: user が離すまで連続認識、stop() で終了させる.
      recognition.continuous = true;
      // interim を ref に保存 → 短い発話で isFinal が来る前に stop() しても最後の interim を採用.
      recognition.interimResults = true;

      // セッションごとに accumulated をリセット
      accumulatedRef.current = "";

      recognition.onresult = (event) => {
        // 全 results を結合 (final + interim、現在認識中の全文).
        let combined = "";
        for (let i = 0; i < event.results.length; i++) {
          const r = event.results[i];
          if (r) combined += r[0].transcript;
        }
        accumulatedRef.current = combined;
      };
      recognition.onerror = (event) => {
        const code = event.error || "unknown";
        const map: Record<string, string> = {
          "no-speech": "音声が検出されませんでした",
          "audio-capture": "マイクが見つかりません",
          "not-allowed": "マイクの使用が許可されていません",
          network: "ネットワークエラーで音声認識サーバに接続できませんでした",
          aborted: "音声入力が中断されました",
        };
        // no-speech / aborted は通常動作として idle に戻すだけ
        if (code === "no-speech" || code === "aborted") {
          setState("idle");
        } else {
          setErrorMessage(map[code] ?? `音声認識エラー: ${code}`);
          setState("error");
        }
      };
      recognition.onend = () => {
        const final = accumulatedRef.current.trim();
        if (final) {
          // 同じ final でも必ず親に通知するため、nonce を increment.
          setTranscript((prev) => ({ text: final, nonce: prev.nonce + 1 }));
        }
        accumulatedRef.current = "";
        setState((prev) => (prev === "error" ? "error" : "idle"));
      };

      recognitionRef.current = recognition;
      recognition.start();
      setState("recording");
    } catch (err) {
      setErrorMessage(`音声認識を開始できませんでした: ${String(err)}`);
      setState("error");
    }
  }, []);

  const stop = useCallback(async () => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    accumulatedRef.current = "";
    setState("idle");
    setTranscript((prev) => ({ text: "", nonce: prev.nonce + 1 }));
    setErrorMessage(null);
  }, []);

  // unmount 時に abort
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { state, transcript, errorMessage, start, stop, reset };
}

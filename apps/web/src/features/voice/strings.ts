/** Voice feature strings (ultrathink U7d NFR Req Imp3: i18n future-proof). */
export const STRINGS = {
  micIdle: "話す",
  micRecording: "録音中...",
  micProcessing: "処理中...",
  micError: "再試行",
  errorPermission: "マイクの利用が許可されていません。ブラウザ設定を確認してください。",
  errorUnsupported: "このブラウザは音声入力に対応していません。",
  errorTimeout: "音声認識に時間がかかっています。",
  clientOnlyHint: "ブラウザ内蔵音声認識を使用します。",
} as const;

export type VoiceStringKey = keyof typeof STRINGS;
export function t(key: VoiceStringKey): string {
  return STRINGS[key];
}

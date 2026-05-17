import type { YesmanApiClient } from "../client";
import { request } from "../client";
import type { components } from "../generated/schema";

export type VoiceConfig = components["schemas"]["VoiceConfigResponse"];
export type TTSRequest = components["schemas"]["TTSRequestDTO"];
export type TTSResponse = components["schemas"]["TTSResponseDTO"];
export type STTResponse = components["schemas"]["STTResponseDTO"];

export class VoiceModule {
  constructor(private client: YesmanApiClient) {}

  async getConfig(): Promise<VoiceConfig> {
    return request<VoiceConfig>(this.client, "/v1/voice/config");
  }

  async tts(payload: TTSRequest): Promise<TTSResponse> {
    return request<TTSResponse>(this.client, "/v1/voice/tts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * multipart audio upload で STT (NFR Design §4.2).
   * Content-Type は FormData が自動で multipart/form-data + boundary を設定する.
   */
  async stt(
    audio: Blob,
    contentType: string,
    languageCode: string = "ja-JP",
  ): Promise<STTResponse> {
    const form = new FormData();
    form.append("audio", audio, `audio.${_extFromContentType(contentType)}`);
    form.append("language_code", languageCode);
    // FormData 渡し時は Content-Type を自動設定させる (client.ts で application/json 既定が
    // 上書きされるため、明示的に削除 / 上書き不要にする)
    return request<STTResponse>(this.client, "/v1/voice/stt", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "" }, // 空文字で削除誘導、後で fetch が自動設定
    });
  }
}

function _extFromContentType(ct: string): string {
  if (ct.includes("webm")) return "webm";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mp4") || ct.includes("m4a")) return "m4a";
  if (ct.includes("mp3") || ct.includes("mpeg")) return "mp3";
  if (ct.includes("flac")) return "flac";
  return "bin";
}

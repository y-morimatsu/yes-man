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
    // FormData は client.ts 側で Content-Type を unset 処理してブラウザに boundary を
    // 自動付与させる (client.ts L109-115 で isFormDataBody 判定).
    return request<STTResponse>(this.client, "/v1/voice/stt", {
      method: "POST",
      body: form,
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

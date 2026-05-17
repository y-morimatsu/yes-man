import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import { YesmanApiClient } from "../../src/client";

const BASE = "http://localhost:8000";

describe("VoiceModule", () => {
  it("getConfig GET /v1/voice/config", async () => {
    server.use(
      http.get(`${BASE}/v1/voice/config`, () =>
        HttpResponse.json({
          backend: "mock",
          tts_supported: true,
          stt_supported: true,
        }),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const cfg = await client.voice.getConfig();
    expect(cfg.backend).toBe("mock");
  });

  it("tts POST /v1/voice/tts", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/v1/voice/tts`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          audio_url: "",
          backend: "mock",
          duration_seconds: 1.0,
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await client.voice.tts({ text: "テスト" });
    expect(receivedBody).toMatchObject({ text: "テスト" });
  });

  it("tts 409 client_only_backend", async () => {
    server.use(
      http.post(`${BASE}/v1/voice/tts`, () =>
        new HttpResponse(
          JSON.stringify({ detail: { reason: "client_only_backend" } }),
          { status: 409 },
        ),
      ),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    await expect(client.voice.tts({ text: "x" })).rejects.toMatchObject({
      status: 409,
      reason: "client_only_backend",
    });
  });

  it("stt POST /v1/voice/stt with multipart audio", async () => {
    let receivedContentType: string | null = null;
    server.use(
      http.post(`${BASE}/v1/voice/stt`, ({ request }) => {
        receivedContentType = request.headers.get("Content-Type");
        return HttpResponse.json({
          text: "[mock-stt-abc]",
          confidence: 1.0,
          backend: "mock",
        });
      }),
    );
    const client = new YesmanApiClient({ baseUrl: BASE });
    const audio = new Blob([new Uint8Array([0, 0, 0])], { type: "audio/webm" });
    await client.voice.stt(audio, "audio/webm");
    expect(receivedContentType).toContain("multipart/form-data");
  });
});

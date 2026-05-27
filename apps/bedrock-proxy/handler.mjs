/**
 * bedrock-proxy/handler.mjs
 *
 * Browser → CloudFront `/api/*` → Lambda Function URL (AuthType=NONE) → Bedrock Converse.
 *
 * Security layers (no-login MVP):
 *  1. `X-Origin-Verify` header check  — CloudFront 経由のみ通す (direct Function URL は 403)
 *  2. CORS allow only configured origin (CloudFront URL)
 *  3. Prompt length cap (MAX_PROMPT_LENGTH)
 *  4. inferenceConfig.maxTokens cap (=1024)
 *  5. IAM role に Bedrock 特定モデルだけ許可 (stack 側)
 *
 * Request:
 *   POST /api/v1/bedrock/converse
 *   Body: { "prompt": string, "maxTokens"?: number, "temperature"?: number }
 *
 * Response:
 *   200 { "reply": string, "model": string, "usage": {...} }
 *   400 { "error": "..." }
 *   403 { "error": "forbidden" }
 *   500 { "error": "bedrock_error" }
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
});

const ORIGIN_VERIFY_SECRET = process.env.ORIGIN_VERIFY_SECRET ?? "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";
const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH ?? 2000);
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "jp.anthropic.claude-haiku-4-5-20251001-v1:0";

const corsHeaders = (extra = {}) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Origin-Verify",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  ...extra,
});

const json = (statusCode, body) => ({
  statusCode,
  headers: corsHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(body),
});

const getHeader = (event, name) => {
  const h = event.headers ?? {};
  return h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()] ?? null;
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  if (method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // Origin verify (CloudFront 経由のみ)
  if (ORIGIN_VERIFY_SECRET) {
    const verify = getHeader(event, "x-origin-verify");
    if (verify !== ORIGIN_VERIFY_SECRET) {
      return json(403, { error: "forbidden" });
    }
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const prompt = (body.prompt ?? "").toString();
  if (!prompt) {
    return json(400, { error: "prompt_required" });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(400, {
      error: "prompt_too_long",
      max_length: MAX_PROMPT_LENGTH,
    });
  }

  const maxTokens = Math.max(
    1,
    Math.min(Number(body.maxTokens ?? 512), 1024),
  );
  const temperature = Math.max(
    0,
    Math.min(Number(body.temperature ?? 0.7), 1),
  );

  try {
    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [
        { role: "user", content: [{ text: prompt }] },
      ],
      inferenceConfig: { maxTokens, temperature },
    });
    const res = await bedrock.send(cmd);
    const text = res.output?.message?.content?.[0]?.text ?? "";
    return json(200, {
      reply: text,
      model: MODEL_ID,
      usage: res.usage,
      stopReason: res.stopReason,
    });
  } catch (err) {
    console.error("bedrock_error", {
      name: err?.name,
      message: err?.message,
    });
    return json(500, {
      error: "bedrock_error",
      name: err?.name ?? "Unknown",
    });
  }
};

/**
 * AUTO-GENERATED placeholder schema (U7c Phase D).
 *
 * 実環境では `pnpm run generate` で openapi-typescript により自動生成される。
 * 本ファイルは Phase E の TypeScript imports を満たす minimal placeholder。
 *
 * 実生成手順:
 *   1. cd apps/api && pip install -e .[dev]
 *   2. python scripts/dump_openapi.py  # apps/api/openapi.json を生成
 *   3. cd ../../packages/api-client && pnpm install
 *   4. pnpm run generate  # この placeholder を実 schema で上書き
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface paths {
  [path: string]: any;
}

export interface components {
  schemas: {
    // U3 profile
    ProfileResponse: any;
    ProfileUpdateRequest: any;
    // U4 decision
    DecisionRequestDTO: { user_input: string; selected_persona_ids?: string[] | null };
    DecisionResponse: { decision_id: string; domain: string; utterances: unknown[]; proposal_text: string; nudge_url: string; no_attempt_count: number };
    ChoiceRequest: { choice: "yes" | "no" };
    ChoiceResponse: { decision_id: string; nudge_url: string; no_attempt_count: number };
    NudgeResponse: { status: "pending" | "ready" | "failed"; message?: string | null };
    // U4 score
    ScoreHistoryPointResponse: { date: string; yes_ratio: number | null; total: number };
    ScoreResponse: { no_count: number; total: number; ratio: number | null; message: string; history: { date: string; yes_ratio: number | null; total: number }[] };
    // U5 preference
    PreferenceProfileResponse: any;
    PreferenceProfileUpdateRequest: any;
    // U-Persona
    PersonaResponse: { id: string; owner_user_id: string; name: string; description?: string | null; avatar_url?: string | null; prompt_text: string; is_shared: boolean; is_builtin: boolean; is_blocked: boolean; usage_count: number; yes_count: number };
    SharedPersonaSummaryResponse: { id: string; name: string; description?: string | null; avatar_url?: string | null; usage_count: number; yes_acceptance_rate: number; creator_anonymous_id: string };
    PersonaCreateRequest: { name: string; description?: string | null; prompt_text: string; avatar_url?: string | null };
    PersonaUpdateRequest: { name?: string | null; description?: string | null; prompt_text?: string | null; avatar_url?: string | null };
    PersonaShareRequest: { shared: boolean };
    PersonaReportRequest: { reason: "silence-domain" | "malicious" | "copyright" | "other"; detail?: string | null };
    PersonaSelectionResponse: { persona_ids: string[] };
    PersonaSelectionUpdateRequest: { persona_ids: string[] };
    // U6 voice
    VoiceConfigResponse: { backend: "aws" | "web-speech-api" | "mock"; tts_supported: boolean; stt_supported: boolean };
    TTSRequestDTO: { text: string; voice_id?: string | null; language_code?: string };
    TTSResponseDTO: { audio_url: string; backend: string; duration_seconds?: number | null };
    STTResponseDTO: { text: string; confidence: number; backend: string };
  };
}

export interface operations {
  [operationId: string]: any;
}

/**
 * ApiError — API error response の構造化型 (NFR Design §5).
 *
 * ultrathink:
 * - I1 (NFR Req §5): (string & {}) パターンで autocomplete 維持 + drift 耐性
 * - I3 (NFR Req): network_error / request_aborted で uniform マッピング、response: Response | null
 */

export type KnownApiErrorReason =
  // network / client (NFR Req I3)
  | "network_error"
  | "request_aborted"
  // U-Persona
  | "rejected_by_moderator"
  | "invalid_selection_size"
  | "duplicate_personas"
  | "persona_not_accessible"
  | "builtin_immutable"
  | "blocked_immutable"
  | "not_found"
  // U6 voice
  | "client_only_backend"
  | "tts_throttled"
  | "tts_failed"
  | "tts_silenced_domain"
  | "stt_timeout"
  | "stt_failed"
  | "unsupported_audio_format"
  | "unsupported_language"
  | "audio_too_large"
  // U4 decision
  | "no_personas"
  | "no_personas_available"
  | "decision_not_found"
  | "llm_unavailable"
  | "silenced_domain"
  // generic
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "internal_error";

// (string & {}) パターン: 既知 reason の autocomplete を維持しつつ未知 reason も受容
export type ApiErrorReason = KnownApiErrorReason | (string & {});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: ApiErrorReason,
    public readonly detail: unknown,
    public readonly response: Response | null,
  ) {
    super(`API ${status}: ${reason}`);
    this.name = "ApiError";
  }

  /**
   * 非 streaming response の error body を読み取り ApiError 化.
   *
   * ultrathink I2 注: SSE response でも初期 HTTP error (= stream 開始前の error response、
   * 通常短い JSON body) で使用可。streaming 中の error は SSE の `event: error` で別経路.
   */
  static async from(resp: Response): Promise<ApiError> {
    const status = resp.status;
    let detail: unknown = null;
    let reason: ApiErrorReason = "internal_error";
    try {
      const body = await resp.clone().json();
      detail = body.detail ?? body;
      if (Array.isArray(body.detail)) {
        reason = "validation_error";
      } else if (
        typeof body.detail === "object" &&
        body.detail !== null &&
        "reason" in body.detail
      ) {
        reason = (body.detail as { reason: string }).reason;
      } else if (status === 401) {
        reason = "unauthorized";
      } else if (status === 403) {
        reason = "forbidden";
      } else if (status >= 500) {
        reason = "internal_error";
      }
    } catch {
      // body JSON parse 失敗時は generic
    }
    return new ApiError(status, reason, detail, resp);
  }

  is(reason: KnownApiErrorReason): boolean {
    return this.reason === reason;
  }
}

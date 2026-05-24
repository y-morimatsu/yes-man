/**
 * PersonaPoolModule — /v1/persona-pool/* (v3-γ anonymous-strangers Task 3).
 *
 * 6 endpoint:
 *   GET    /v1/persona-pool/me            — status + preview + guard
 *   POST   /v1/persona-pool/opt-in        — 422 if signal_total < 3 (FR-9)
 *   DELETE /v1/persona-pool/opt-in        — idempotent (204)
 *   GET    /v1/persona-pool/random?n=2    — server 側で exclude=self 自動 (NFR-6)
 *   GET    /v1/persona-pool/me/citations  — today_count / all_time_count
 *   GET    /v1/persona-pool/cited-by-me   — 過去合議で召喚した persona 履歴
 *
 * Note: OpenAPI schema 再生成までは types は手書き. backend
 * `apps/api/src/yesman_api/interface/http/dto/persona_pool.py` と同期維持すること.
 */
import type { YesmanApiClient } from "../client";
import { request } from "../client";
import { ApiError } from "../errors";

// ============================================================
// Types (backend persona_pool.py DTO と 1:1)
// ============================================================
export type PrimaryLanguage = "ja" | "en" | "fr" | "ar" | "zh";
export type Formality = "polite" | "casual" | "blunt";

export type AnonymousPersona = {
  /** UUID — backend では sub-deterministic だが client は値を信頼するだけ */
  persona_id: string;
  /** 価値観タグ (max 5) */
  value_tags: string[];
  primary_language: PrimaryLanguage;
  formality: Formality;
};

export type PoolGuardInfo = {
  /** preference から派生した value_tags の件数 (2026-05-24: quirks 仕様削除) */
  signal_total: number;
  /** 最小必要件数 (= MIN_SIGNAL_TOTAL = 3、backend FR-9) */
  min_required: number;
  /** is_eligible === false の時は opt-in トグル disabled (US-2.4 AC-1) */
  is_eligible: boolean;
};

export type PoolStatus = {
  opted_in: boolean;
  /** 流通対象 preview (US-2.3 AC-1、OFF 状態でも常時表示) */
  preview: AnonymousPersona | null;
  guard: PoolGuardInfo;
};

export type RandomPoolResponse = {
  personas: AnonymousPersona[];
};

export type CitationCount = {
  /** 過去 24 時間 (US-2.2 「今日 N 件」) */
  today_count: number;
  /** 累計 (今日 N 件 が 0 でも累計が出る) */
  all_time_count: number;
};

export type CitedHistoryItem = {
  cited_persona_id: string;
  cited_at: string; // ISO 8601
  /** spec が pool から消えていれば null */
  persona: AnonymousPersona | null;
};

export type CitedHistory = {
  items: CitedHistoryItem[];
};

/** FR-9 / US-2.4 guard 違反時の 422 detail (POST /opt-in が返す) */
export type InsufficientSignalsDetail = {
  code: "insufficient_profile_signals";
  signal_total: number;
  min_required: number;
  hint: string;
};

// ============================================================
// Module
// ============================================================
export class PersonaPoolModule {
  constructor(private client: YesmanApiClient) {}

  /** GET /v1/persona-pool/me — opt-in 状態 + preview + FR-9 guard (US-2.3 / US-2.4). */
  async getStatus(): Promise<PoolStatus> {
    return request<PoolStatus>(this.client, "/v1/persona-pool/me");
  }

  /**
   * POST /v1/persona-pool/opt-in — derive + pool 登録.
   *
   * FR-9 / US-2.4: signal_total < min_required の場合 ApiError(422) を throw,
   * caller は `error.body` を `InsufficientSignalsDetail` として展開可能.
   */
  async optIn(): Promise<AnonymousPersona> {
    return request<AnonymousPersona>(this.client, "/v1/persona-pool/opt-in", {
      method: "POST",
      // body 不要 (preference + profile は server side で取得)
      body: JSON.stringify({}),
    });
  }

  /** DELETE /v1/persona-pool/opt-in — idempotent. */
  async optOut(): Promise<void> {
    return request<void>(this.client, "/v1/persona-pool/opt-in", {
      method: "DELETE",
    });
  }

  /**
   * GET /v1/persona-pool/list?limit=N — selection UI 用、caller exclude した一覧.
   *
   * @param limit 1 <= limit <= 100 (default 20)
   * 2026-05-24 v4: random sampling 廃止に伴い、user が anonymous persona を個別選択するための endpoint.
   */
  async list(limit: number = 20): Promise<RandomPoolResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return request<RandomPoolResponse>(
      this.client,
      `/v1/persona-pool/list?${params.toString()}`,
    );
  }

  /** GET /v1/persona-pool/me/citations — US-2.2 「今日 N 件」. */
  async myCitations(): Promise<CitationCount> {
    return request<CitationCount>(this.client, "/v1/persona-pool/me/citations");
  }

  /** GET /v1/persona-pool/cited-by-me — US-3.1 過去に召喚した persona 履歴. */
  async citedByMe(): Promise<CitedHistory> {
    return request<CitedHistory>(this.client, "/v1/persona-pool/cited-by-me");
  }
}

// ============================================================
// Typed error helpers (I-2 fix: caller が type-safe に 422 detail を扱える)
// ============================================================

/**
 * `optIn()` が投げる 422 ApiError が FR-9 / US-2.4 guard 違反である場合に true を返す type guard.
 *
 * Note: ApiError は `detail` プロパティに backend response の body.detail を保持する
 * (errors.ts: ApiError.from で body.detail を取り出す). よって caller は
 * `err.detail.hint` を type-safe にアクセス可能.
 *
 * 用途例 (Task 7 OptInCard):
 * ```ts
 * try {
 *   await client.personaPool.optIn();
 * } catch (err) {
 *   if (isInsufficientSignalsError(err)) {
 *     setInlineMessage(err.detail.hint);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 */
export function isInsufficientSignalsError(
  err: unknown,
): err is ApiError & { detail: InsufficientSignalsDetail } {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 422) return false;
  const detail = err.detail as { code?: string } | null;
  return detail?.code === "insufficient_profile_signals";
}

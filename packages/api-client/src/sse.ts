/**
 * SSE wrapper — DecisionStream + parseSseChunk (NFR Design §6).
 *
 * ultrathink:
 * - FD §6.1: fetch + ReadableStream を採用 (EventSource は Authorization header 不可)
 * - I2 (NFR Req): data 複数行を newline で join (W3C SSE spec)
 * - I3 (NFR Design): finally で reader.cancel() で server 切断通知 + lock 自動 release
 */

import type { YesmanApiClient } from "./client";
import type { components } from "./generated/schema";
// I-1 fix (Task 3 ultrathink): PrimaryLanguage / Formality を persona-pool.ts に統一
// (将来言語追加時に 1 箇所更新で済むよう DRY 化)
import type { Formality, PrimaryLanguage } from "./modules/persona-pool";
import { ApiError } from "./errors";

// 2026-05-23 Drill-down chain: chain_context を optional 追加
// 2026-05-24 v3-γ anonymous-strangers: persona_source を optional 追加
// 2026-05-24 v4: selected_personas (3 source mix) を追加. persona_source は backward compat.
export type SelectedPersonaSource = "builtin" | "anonymous" | "my";
export interface SelectedPersonaRef {
  source: SelectedPersonaSource;
  id: string;
}
export type DecisionRequestPayload =
  components["schemas"]["DecisionRequestDTO"] & {
    chain_context?: string[];
    persona_source?: "builtin" | "anonymous";
    /** 2026-05-24 v4: 3 source mix 選択. 指定時は persona_source / selected_persona_ids より優先. */
    selected_personas?: SelectedPersonaRef[];
  };

export type DecisionStreamEvent =
  | { type: "start"; data: { decision_id: string } }
  // Post-CONSTRUCTION v3 (2026-05-23): personas pre-fill - delta 到着前から bubble header を可視化
  | { type: "personas"; data: { personas: { id: string; name: string }[] } }
  // Post-CONSTRUCTION v3 (2026-05-23): token streaming - text は LLM chunk
  // v3-γ (2026-05-24): anonymous 経路では utterance_delta は **emit されない** (FR-3 / NFR-2)
  | { type: "utterance_delta"; data: { persona_id: string; persona_name: string; text: string } }
  // v3-γ (2026-05-24): anonymous 経路では optional 拡張 (primary_language / formality).
  // 2026-05-24: 「原文を表示」機能削除に伴い `original` field は廃止 (日本語 text のみ).
  | {
      type: "utterance";
      data: {
        persona_id: string;
        persona_name: string;
        text: string;
        primary_language?: PrimaryLanguage;
        formality?: Formality;
      };
    }
  // 2026-05-23 Drill-down chain: is_final + service を proposal event に同梱
  | {
      type: "proposal";
      data: {
        proposal_text: string;
        is_final?: boolean;
        depth?: number;
        service?: { name: string; url: string; emoji: string } | null;
      };
    }
  | { type: "complete"; data: { decision_id: string } }
  // INCEPTION D Silence Theater: 沈黙ドメイン (宗教/選挙/暴力/卑猥) 検出時
  | { type: "silence"; data: { text: string } }
  | { type: "error"; data: { reason: string; detail?: string } };

export class DecisionStream {
  constructor(
    private client: YesmanApiClient,
    private payload: DecisionRequestPayload,
  ) {}

  async *events(signal?: AbortSignal): AsyncGenerator<DecisionStreamEvent> {
    const token = await this.client.tokenProvider?.getToken();
    let resp: Response;
    try {
      resp = await this.client.fetchImpl(
        `${this.client.baseUrl}/v1/decisions/request/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(this.payload),
          signal,
        },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(0, "request_aborted", { message: err.message }, null);
      }
      throw new ApiError(0, "network_error", { message: String(err) }, null);
    }
    if (!resp.ok) throw await ApiError.from(resp);
    if (!resp.body) {
      throw new ApiError(500, "internal_error", { message: "SSE body missing" }, resp);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = parseSseChunk(chunk);
          if (event) yield event;
        }
      }
    } finally {
      // ultrathink NFR Design I3: AsyncGenerator が外側で break された場合、
      // reader.cancel() で server に切断通知 + lock 自動 release.
      try {
        await reader.cancel();
      } catch {
        // already cancelled or stream finished、無視
      }
    }
  }
}

export function parseSseChunk(chunk: string): DecisionStreamEvent | null {
  // ultrathink NFR Req I2: SSE spec で `data:` 複数行は newline で join される (W3C SSE).
  const lines = chunk.split("\n");
  let event = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  if (!event || dataLines.length === 0) return null;
  const dataRaw = dataLines.join("\n");
  try {
    return { type: event, data: JSON.parse(dataRaw) } as DecisionStreamEvent;
  } catch {
    return null;
  }
}

/**
 * describeError — unknown 型のエラーから user-facing メッセージを抽出.
 *
 * 既存 `String(err)` だと object は `[object Object]` になってしまうため、
 * SSE error event payload `{reason, detail}` / ApiError / Error / string を統一処理.
 */
import { ApiError } from "@yesman/api-client";

function detailMessage(detail: unknown): string | null {
  if (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof (detail as { message: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }
  return null;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const dm = detailMessage(err.detail);
    return dm ? `${err.reason}: ${dm}` : err.reason;
  }
  if (err instanceof Error) {
    return err.message || err.name || "Error";
  }
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    // SSE error event payload: { reason, detail }
    if (typeof obj.reason === "string") {
      const dm = detailMessage(obj.detail);
      return dm ? `${obj.reason}: ${dm}` : obj.reason;
    }
    if (typeof obj.message === "string") return obj.message;
    try {
      return JSON.stringify(err);
    } catch {
      return "unknown error";
    }
  }
  return String(err);
}

/**
 * @yesman/api-client — public entry.
 *
 * U7c (FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 + Code Gen Plan 6 = 28 fixes).
 */

export { YesmanApiClient, validateBaseUrl, request } from "./client";
export type { YesmanApiClientOptions } from "./client";
export type { TokenProvider } from "./auth";
export { ApiError } from "./errors";
export type { KnownApiErrorReason, ApiErrorReason } from "./errors";
export { DecisionStream, parseSseChunk } from "./sse";
export type { DecisionStreamEvent } from "./sse";
export * from "./modules";

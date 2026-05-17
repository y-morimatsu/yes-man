/**
 * YesmanApiClient — main entry, 7 module 統合 (NFR Design §4 + §8).
 *
 * ultrathink:
 * - I1 (NFR Design): auth custom field を destructure 分離、signal は spread で自動継承
 * - I2 (NFR Req): HTTPS 強制 + dev hostname allowlist + warning
 * - I3 (NFR Req): network_error / request_aborted を ApiError でラップ
 * - Imp1 (NFR Design): header merge 順序 defaultHeaders → init.headers → specific
 * - Imp2 (FD): TokenProvider.refresh() で 401 retry (retryOn401 flag で infinite loop 防止)
 */

import type { TokenProvider } from "./auth";
import { ApiError } from "./errors";
import {
  ProfilesModule,
  DecisionsModule,
  ScoresModule,
  PreferencesModule,
  PersonasModule,
  PersonaSelectionsModule,
  VoiceModule,
} from "./modules";

export interface YesmanApiClientOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  onError?: (error: ApiError) => void;
}

export function validateBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl: ${baseUrl}`);
  }
  if (url.protocol === "https:") return;
  if (url.protocol === "http:") {
    // ultrathink Imp2 (NFR Design): resolver 注記
    // - localhost / 127.0.0.1 / ::1: 全 OS / resolver で 127.0.0.1 解決
    // - *.localhost: RFC 6761 で必ず 127.0.0.1 にループバック
    // - *.local: mDNS 要 (macOS Bonjour、Linux nss-mdns / avahi)、CI 環境では使わない方が無難
    const devHostsRe = /^(localhost|127\.0\.0\.1|::1|.*\.local|.*\.localhost)$/;
    if (devHostsRe.test(url.hostname)) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[YesmanApiClient] Non-HTTPS baseUrl: ${baseUrl}. ` +
        `Authorization headers will be sent in clear text. ` +
        `Only use http for dev hosts (localhost/127.0.0.1/*.local).`,
    );
    return;
  }
  throw new Error(`Invalid baseUrl protocol: ${url.protocol}`);
}

export class YesmanApiClient {
  readonly baseUrl: string;
  readonly tokenProvider?: TokenProvider;
  readonly fetchImpl: typeof fetch;
  readonly defaultHeaders: Record<string, string>;
  readonly onError?: (error: ApiError) => void;

  readonly profiles: ProfilesModule;
  readonly decisions: DecisionsModule;
  readonly scores: ScoresModule;
  readonly preferences: PreferencesModule;
  readonly personas: PersonasModule;
  readonly personaSelections: PersonaSelectionsModule;
  readonly voice: VoiceModule;

  constructor(options: YesmanApiClientOptions) {
    validateBaseUrl(options.baseUrl); // NFR Req §2.1 + ultrathink I2
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};
    if (
      "Authorization" in this.defaultHeaders ||
      "authorization" in this.defaultHeaders
    ) {
      throw new Error(
        "defaultHeaders must not contain Authorization (use tokenProvider instead). [SEC-U7c-03]",
      );
    }
    this.onError = options.onError;
    this.profiles = new ProfilesModule(this);
    this.decisions = new DecisionsModule(this);
    this.scores = new ScoresModule(this);
    this.preferences = new PreferencesModule(this);
    this.personas = new PersonasModule(this);
    this.personaSelections = new PersonaSelectionsModule(this);
    this.voice = new VoiceModule(this);
  }
}

export async function request<T>(
  client: YesmanApiClient,
  path: string,
  init: RequestInit & { auth?: boolean } = {},
  retryOn401: boolean = true,
): Promise<T> {
  // ultrathink Imp1: header merge 順序 defaultHeaders → init.headers → specific
  const headers = new Headers(client.defaultHeaders);
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth !== false && client.tokenProvider) {
    const token = await client.tokenProvider.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  // ultrathink I1 (NFR Design): custom field auth を destructure 分離、signal は spread で継承
  const { auth: _auth, ...fetchInitRaw } = init;
  const fetchInit: RequestInit = { ...fetchInitRaw, headers };

  let resp: Response;
  try {
    resp = await client.fetchImpl(`${client.baseUrl}${path}`, fetchInit);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      const apiErr = new ApiError(0, "request_aborted", { message: err.message }, null);
      client.onError?.(apiErr);
      throw apiErr;
    }
    const apiErr = new ApiError(0, "network_error", { message: String(err) }, null);
    client.onError?.(apiErr);
    throw apiErr;
  }

  // ultrathink FD Imp2: 401 で TokenProvider.refresh があれば 1 回 retry
  if (resp.status === 401 && retryOn401 && client.tokenProvider?.refresh) {
    const refreshed = await client.tokenProvider.refresh();
    if (refreshed) {
      return request(client, path, init, false);
    }
  }

  if (!resp.ok) {
    const apiErr = await ApiError.from(resp);
    client.onError?.(apiErr);
    throw apiErr;
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

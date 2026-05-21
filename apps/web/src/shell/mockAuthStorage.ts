/**
 * mockAuthStorage — localStorage に Mock auth 用 state を保持する純粋 module.
 *
 * spec: docs/superpowers/specs/2026-05-20-mock-auth-design.md
 *
 * 注意:
 * - VITE_AUTH_BYPASS=true の場合にのみ呼ばれる前提 (env チェックは呼び出し側で行う)
 * - localStorage が壊れている場合は静かに空状態にリセット (private mode 等)
 */

export interface MockUser {
  email: string;
  display_name?: string;
  /** UUID v4. ユーザ登録時に crypto.randomUUID() で採番. API Bearer に埋め込まれ Profile PK と整合. */
  sub: string;
  created_at: string; // ISO 8601
}

const USERS_KEY = "yesman:mock-auth:users";
const CURRENT_KEY = "yesman:mock-auth:current-email";

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage への書き込み. QuotaExceeded / private mode で false を返す. */
function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** test 用: 内部 cache をリセット.
 *
 * NOTE: 現状 module-scope cache は持たないため no-op。
 * 将来 in-memory cache を追加した場合は、ここで必ずリセットすること
 * (テストの localStorage.clear() と整合させるため).
 */
export function resetForTesting(): void {
  /* no-op: no module-scope cache currently */
}

export function listUsers(): MockUser[] {
  const raw = safeRead(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is MockUser =>
        typeof u === "object" &&
        u !== null &&
        typeof u.email === "string" &&
        typeof u.sub === "string" &&
        typeof u.created_at === "string",
    );
  } catch {
    // 破損 JSON: 静かに空に
    safeRemove(USERS_KEY);
    return [];
  }
}

function generateSub(): string {
  // crypto.randomUUID() は modern browsers + jsdom 22+ で利用可能
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback (古い jsdom / Node 16 等): RFC4122 v4 風の文字列
  const hex = (n: number) => Math.floor(Math.random() * n).toString(16);
  const part = (len: number) => Array.from({ length: len }, () => hex(16)).join("");
  return `${part(8)}-${part(4)}-4${part(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${part(3)}-${part(12)}`;
}

export function registerUser(email: string, display_name?: string): MockUser {
  const normalized = normalize(email);
  const users = listUsers();
  const existing = users.find((u) => u.email === normalized);
  if (existing) return existing;
  const created: MockUser = {
    email: normalized,
    display_name: display_name?.trim() || undefined,
    sub: generateSub(),
    created_at: new Date().toISOString(),
  };
  if (!safeWrite(USERS_KEY, JSON.stringify([...users, created]))) {
    throw new Error("mockAuth: localStorage write failed (quota exceeded or private mode)");
  }
  return created;
}

export function setCurrentEmail(email: string): void {
  const normalized = normalize(email);
  const users = listUsers();
  if (!users.some((u) => u.email === normalized)) {
    throw new Error(`mockAuth: email not registered: ${normalized}`);
  }
  if (!safeWrite(CURRENT_KEY, normalized)) {
    throw new Error("mockAuth: localStorage write failed (quota exceeded or private mode)");
  }
}

export function getCurrentEmail(): string | null {
  return safeRead(CURRENT_KEY);
}

export function clearCurrent(): void {
  safeRemove(CURRENT_KEY);
}

export function getCurrentUser(): MockUser | null {
  const current = getCurrentEmail();
  if (!current) return null;
  const users = listUsers();
  return users.find((u) => u.email === current) ?? null;
}

/** 既存ユーザの display_name を上書きセット. 空文字 (or 全空白) を渡すと undefined に戻す.
 *  存在しない email は throw. localStorage 書き込み失敗時も throw.
 *  (新規登録時の 1-shot 埋め込みは updateDisplayName を使うこと)
 */
export function setDisplayName(email: string, display_name: string): void {
  const normalized = normalize(email);
  const trimmed = display_name.trim();
  const users = listUsers();
  const existing = users.find((u) => u.email === normalized);
  if (!existing) {
    throw new Error(`mockAuth: email not registered: ${normalized}`);
  }
  const updated = users.map((u) =>
    u.email === normalized ? { ...u, display_name: trimmed || undefined } : u,
  );
  if (!safeWrite(USERS_KEY, JSON.stringify(updated))) {
    throw new Error("mockAuth: localStorage write failed (quota exceeded or private mode)");
  }
}

/** 既存ユーザの display_name を埋める. display_name 既設定の場合は no-op (上書きしない).
 *  存在しない email は throw. localStorage 書き込み失敗時も throw.
 */
export function updateDisplayName(email: string, display_name: string): void {
  const normalized = normalize(email);
  const trimmed = display_name.trim();
  if (!trimmed) return;
  const users = listUsers();
  const existing = users.find((u) => u.email === normalized);
  if (!existing) {
    throw new Error(`mockAuth: email not registered: ${normalized}`);
  }
  if (existing.display_name) return; // 上書きしない (idempotency)
  const updated = users.map((u) =>
    u.email === normalized ? { ...u, display_name: trimmed } : u,
  );
  if (!safeWrite(USERS_KEY, JSON.stringify(updated))) {
    throw new Error("mockAuth: localStorage write failed (quota exceeded or private mode)");
  }
}

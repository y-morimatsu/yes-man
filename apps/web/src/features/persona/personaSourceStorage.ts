/**
 * personaSourceStorage — Persona Selection の source 選択を localStorage で永続化.
 *
 * v3-γ anonymous-strangers (2026-05-24):
 * - "builtin": 既存 3 種 (cautious/bold/pragmatic) 合議 (v0.4.0 default、regression 防止)
 * - "anonymous": 「世界の誰か」匿名 pool 合議 (mockup §8 + 漫画ステージ)
 * - "my" (2026-05-24): 自作 (custom) persona の一覧表示・選択タブ.
 *
 * localStorage key: `yesman:persona-source` (既存 key と衝突しないこと).
 * default: "builtin" (新規 user は v0.4.0 経路、Task 4 / US-4.1 AC-2).
 */
export type PersonaSource = "builtin" | "anonymous" | "my";

const STORAGE_KEY = "yesman:persona-source";
const DEFAULT_SOURCE: PersonaSource = "builtin";

const isValid = (v: unknown): v is PersonaSource =>
  v === "builtin" || v === "anonymous" || v === "my";

/** 保存済みの source を取得 (未保存 / 不正値 / SSR は default = "builtin"). */
export function readPersonaSource(): PersonaSource {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isValid(raw)) return raw;
  } catch {
    // privacy mode / SSR は default fallback
  }
  return DEFAULT_SOURCE;
}

/** source を保存. quota / privacy mode は silent fail. */
export function writePersonaSource(source: PersonaSource): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, source);
  } catch {
    // ignore
  }
}

/** Test / Debug 用: 保存済 source をクリア. */
export function clearPersonaSource(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { DEFAULT_SOURCE, STORAGE_KEY };

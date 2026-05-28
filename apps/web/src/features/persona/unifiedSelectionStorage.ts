/**
 * unifiedSelectionStorage — 2026-05-24 v4 統合 selection (3 source mix).
 *
 * 旧 backend `persona_ids` (builtin/my のみ) を置き換える localStorage ベースの選択 store.
 * - source: "builtin" | "anonymous" | "my"
 * - max 3 (source 混在可)
 * - 端末 / browser ごとに保持 (簡素化のため backend 同期しない、hackathon scope).
 */
import type { SelectedPersonaSource } from "@yesman/api-client";

import { getCurrentUser } from "../../shell/mockAuthStorage";

const STORAGE_KEY = "yesman:unified-selection-v1";
export const MAX_SELECTION = 3;

/**
 * デモアカウント (email に "morimatsu") 用の固定カスタムペルソナ ID。
 * backend demo_mode.DEMO_PERSONAS (妻 / 娘 / ワンコ) と一致。
 * 新規サインイン時の既定選択をビルトインではなく家族 3 人にするために使う。
 */
const DEMO_PERSONA_IDS = [
  "00000000-0000-0000-0000-0000000000d1", // 妻
  "00000000-0000-0000-0000-0000000000d2", // 娘
  "00000000-0000-0000-0000-0000000000d3", // ワンコ
] as const;
const DEMO_SELECTION: SelectedPersona[] = DEMO_PERSONA_IDS.map((id) => ({
  source: "my",
  id,
}));

function isDemoUser(): boolean {
  try {
    const email = getCurrentUser()?.email;
    return !!email && email.toLowerCase().includes("morimatsu");
  } catch {
    return false;
  }
}

export interface SelectedPersona {
  source: SelectedPersonaSource;
  id: string;
}

/**
 * Builtin (preset) ペルソナの UUID。backend の alembic 0002 / mock seed と一致する
 * 決定論的な固定 ID (慎重派 / 楽観派 / 効率派)。
 * source of truth: apps/api alembic 0002_builtin_personas + mock_repositories._seed_builtin_personas。
 */
const BUILTIN_PERSONA_IDS = [
  "00000000-0000-0000-0000-0000000000a1", // 慎重派
  "00000000-0000-0000-0000-0000000000a2", // 楽観派
  "00000000-0000-0000-0000-0000000000a3", // 効率派
] as const;

/**
 * 新規ユーザーのデフォルト選択。登録直後 (localStorage 未作成時) に builtin 3 種を
 * 決定参加ペルソナとしてプリセット選択する。明示的な reset / 選択変更後は尊重される。
 */
export const DEFAULT_BUILTIN_SELECTION: SelectedPersona[] =
  BUILTIN_PERSONA_IDS.map((id) => ({ source: "builtin", id }));

function isValidEntry(v: unknown): v is SelectedPersona {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    (e.source === "builtin" || e.source === "anonymous" || e.source === "my")
  );
}

export function readUnifiedSelection(): SelectedPersona[] {
  if (typeof window === "undefined") return [...DEFAULT_BUILTIN_SELECTION];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // キー未作成 = 新規ユーザー (登録直後) → デフォルト選択。
    // デモアカウント (morimatsu) は 妻/娘/ワンコ、それ以外は builtin 3 種。
    // キーが存在する場合 (空配列含む) は user の明示的な選択結果として尊重する。
    if (raw === null) {
      return isDemoUser() ? [...DEMO_SELECTION] : [...DEFAULT_BUILTIN_SELECTION];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_SELECTION);
  } catch {
    return [];
  }
}

export function writeUnifiedSelection(entries: SelectedPersona[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(0, MAX_SELECTION);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode は ignore (state はメモリで維持される) */
  }
}

export function clearUnifiedSelection(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** entry の同一性 (source+id 一致). */
export function isSameEntry(a: SelectedPersona, b: SelectedPersona): boolean {
  return a.source === b.source && a.id === b.id;
}

/**
 * onboardingStorage.ts — per-user の onboarding 完了フラグを localStorage で管理.
 *
 * 旧実装は `yesman:onboarding:completed-at` (browser-wide の単一 timestamp) のみで、
 * 同じブラウザで複数ユーザを新規登録した場合に 2 人目以降が onboarding を skip して
 * しまうバグがあった (2026-05-23、user report)。本モジュールで sub 別に completed
 * を保持する。
 *
 * stored value: { completed_subs: string[] } (localStorage key)
 */

const STORAGE_KEY = "yesman:onboarding:completed-subs";

interface Stored {
  completed_subs: string[];
}

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed_subs: [] };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!Array.isArray(parsed?.completed_subs)) return { completed_subs: [] };
    return { completed_subs: parsed.completed_subs.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ) };
  } catch {
    return { completed_subs: [] };
  }
}

function write(stored: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // quota / privacy mode 等は silent fail
  }
}

/** 指定 user sub が onboarding を完了済かどうか. */
export function hasOnboarded(sub: string): boolean {
  if (!sub) return false;
  return read().completed_subs.includes(sub);
}

/** 指定 user sub の onboarding 完了を記録. */
export function markOnboarded(sub: string): void {
  if (!sub) return;
  const stored = read();
  if (stored.completed_subs.includes(sub)) return;
  stored.completed_subs.push(sub);
  write(stored);
}

/** Test / Debug 用: 完了済 sub をリセット. */
export function clearOnboardedAll(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

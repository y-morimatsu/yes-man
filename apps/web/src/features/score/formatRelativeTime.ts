/** 相対時刻 5 段階フォーマット (spec §7).
 *
 * < 1m  : 「たった今」
 * < 1h  : 「N 分前」
 * < 24h : 「N 時間前」
 * 1d    : 「昨日」
 * < 7d  : 「N 日前」
 * ≥ 7d  : 「YYYY-MM-DD」
 *
 * 未来時刻 (now < then) は防御的に「たった今」扱い。
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return "たった今";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMs / 3_600_000);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay} 日前`;
  return iso.slice(0, 10); // YYYY-MM-DD
}

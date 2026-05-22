/** surrogate pair 対応の truncate.
 *
 * 文字列が n char (UnicodeScalar count) を超える場合、n char までで切り「…」を付与。
 * 絵文字などの surrogate pair は [...s] で 1 char として扱う。
 */
export function truncate(s: string, n: number): string {
  const chars = [...s];
  if (chars.length <= n) return s;
  return chars.slice(0, n).join("") + "…";
}

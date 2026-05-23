/**
 * Quick-Start template pool (AI pre-generated, build-time).
 *
 * spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §6
 *
 * JSON は apps/api/scripts/generate_quick_start_templates.py で生成。
 * runtime での LLM 呼び出しは行わない (cold-start 高速・コスト 0)。
 */
import templatesJson from "./quickStartTemplates.generated.json";

export type DayKind = "weekday" | "weekend" | "any";

export interface QuickStartTemplate {
  id: string;
  title: string;
  hours: number[];
  dayKind: DayKind;
  preferenceTag: string | null;
  priority: number;
}

export interface QuickStartTemplatePool {
  generatedAt: string;
  generatedBy: string;
  schemaVersion: 1;
  templates: QuickStartTemplate[];
  catchAll: QuickStartTemplate;
}

// vite は JSON を ESM として import 可能。型は明示的に narrow する.
export const pool = templatesJson as unknown as QuickStartTemplatePool;

export function resolveDayKind(now: Date): "weekday" | "weekend" {
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

/**
 * 指定時刻・曜日にマッチする template を priority 降順で並べた queue を返す.
 * catchAll は常に末尾に追加.
 *
 * - hours が空 (= "any time") の template は全時刻でマッチ
 * - dayKind === "any" は平日・週末ともマッチ
 * - excludeIds (直近 YES 採択済) は除外
 * - tie-break: priority 同点 → id ASC で安定 sort
 */
export function selectQuickStartQueue(
  now: Date,
  excludeIds: ReadonlySet<string> = new Set(),
  source: QuickStartTemplatePool = pool,
): QuickStartTemplate[] {
  const hour = now.getHours();
  const dayKind = resolveDayKind(now);

  const matched = source.templates.filter((t) => {
    if (excludeIds.has(t.id)) return false;
    if (t.dayKind !== "any" && t.dayKind !== dayKind) return false;
    if (t.hours.length > 0 && !t.hours.includes(hour)) return false;
    return true;
  });

  matched.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  // catchAll は spec §6「常に最後の候補」のため、recent-yes 除外を通さず必ず末尾に追加。
  // (以前は excludeIds.has() を見て除外していたが、user が catchAll に YES した直後に
  //  全 template + catchAll が除外され queue 空 → mode=text に転落するバグを引き起こしていた)
  matched.push(source.catchAll);
  return matched;
}

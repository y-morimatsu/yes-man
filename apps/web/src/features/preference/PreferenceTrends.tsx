/**
 * PreferenceTrends — 嗜好プロファイルの傾向表示 (display-only).
 *
 * PreferencePage と ScorePage で共有する display component.
 *   - 採択された傾向 (domain 別集計)
 *   - 棄却された傾向 (domain 別集計)
 *   - ペルソナ嗜好 (score [-1, 1] の bar graph)
 *   - 推定タグ
 *
 * Reset / 編集等の mutation UI は含まない (caller 側で持つ).
 */
import { Card, Skeleton } from "@yesman/ui";
import { usePreference } from "./usePreference";
import { t } from "./strings";

interface PatternDict {
  domain?: string;
  keywords?: string[];
  persona_names?: string[];
  weight?: number;
  decision_id?: string;
  timestamp?: string;
}

interface ProfileShape {
  accepted_patterns?: PatternDict[];
  rejected_patterns?: PatternDict[];
  persona_style_preference?: Record<string, number>;
  inferred_tags?: string[];
}

function aggregateByDomain(
  patterns: PatternDict[],
): { domain: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const p of patterns) {
    const d = p.domain ?? "(unknown)";
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

export interface PreferenceTrendsProps {
  /** 表示密度. compact = ScorePage 用 (header 簡素), full = PreferencePage 用. */
  density?: "compact" | "full";
}

export function PreferenceTrends({ density = "full" }: PreferenceTrendsProps) {
  const { data, isPending } = usePreference();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" data-testid="preference-trends-loading">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <p
        className="text-sm text-neutral-500"
        data-testid="preference-trends-empty"
      >
        {t("empty")}
      </p>
    );
  }

  const profile = data as ProfileShape;
  const accepted = profile.accepted_patterns ?? [];
  const rejected = profile.rejected_patterns ?? [];
  const personaStyle = profile.persona_style_preference ?? {};
  const inferredTags = profile.inferred_tags ?? [];

  const acceptedDomains = aggregateByDomain(accepted);
  const rejectedDomains = aggregateByDomain(rejected);
  const personaEntries = Object.entries(personaStyle).sort(
    (a, b) => b[1] - a[1],
  );
  const isEmpty =
    accepted.length === 0 &&
    rejected.length === 0 &&
    personaEntries.length === 0 &&
    inferredTags.length === 0;

  if (isEmpty) {
    return (
      <p
        className="text-sm text-neutral-500"
        data-testid="preference-trends-empty"
      >
        {t("empty")}
      </p>
    );
  }

  const headingClass =
    density === "compact"
      ? "font-sans font-semibold mb-2 text-sm"
      : "font-sans font-semibold mb-2";

  return (
    <div className="flex flex-col gap-3" data-testid="preference-trends">
      {/* 採択された傾向 — domain 別の集計 */}
      <Card>
        <h3 className={`${headingClass} text-success`}>
          ✓ {t("labelAccepted")}
          <span className="ml-2 text-xs text-neutral-500 font-normal">
            (計 {accepted.length} 件)
          </span>
        </h3>
        {acceptedDomains.length === 0 ? (
          <p className="text-sm text-neutral-400">
            まだデータがありません
          </p>
        ) : (
          <ul className="text-sm flex flex-col gap-1.5">
            {acceptedDomains.map(({ domain, count }) => (
              <li key={domain} className="flex items-center gap-2">
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs"
                  style={{ background: "#E8F5E9", color: "#1B5E20" }}
                >
                  {domain}
                </span>
                <span className="font-mono text-neutral-700">{count} 回</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 棄却された傾向 — domain 別の集計 */}
      <Card>
        <h3 className={`${headingClass} text-silence`}>
          ✕ {t("labelRejected")}
          <span className="ml-2 text-xs text-neutral-500 font-normal">
            (計 {rejected.length} 件)
          </span>
        </h3>
        {rejectedDomains.length === 0 ? (
          <p className="text-sm text-neutral-400">
            まだデータがありません
          </p>
        ) : (
          <ul className="text-sm flex flex-col gap-1.5">
            {rejectedDomains.map(({ domain, count }) => (
              <li key={domain} className="flex items-center gap-2">
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs"
                  style={{ background: "#ECEFF1", color: "#455A64" }}
                >
                  {domain}
                </span>
                <span className="font-mono text-neutral-700">{count} 回</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ペルソナ嗜好 — score [-1, 1] を bar graph で */}
      <Card>
        <h3 className={headingClass}>🎭 {t("labelPersonaStyle")}</h3>
        {personaEntries.length === 0 ? (
          <p className="text-sm text-neutral-400">
            まだデータがありません
          </p>
        ) : (
          <dl className="flex flex-col gap-2">
            {personaEntries.map(([name, score]) => {
              const pct = Math.abs(score) * 100;
              const isPositive = score >= 0;
              return (
                <div
                  key={name}
                  className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2"
                >
                  <dt className="text-sm">{name}</dt>
                  <dd className="relative h-3 rounded bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(pct, 4)}%`,
                        background: isPositive ? "#66BB6A" : "#90A4AE",
                      }}
                    />
                  </dd>
                  <dd className="font-mono text-xs text-right text-neutral-700">
                    {score >= 0 ? "+" : ""}
                    {score.toFixed(2)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </Card>

      {/* 推定タグ */}
      {inferredTags.length > 0 && (
        <Card>
          <h3 className={headingClass}>🏷️ {t("labelInferredTags")}</h3>
          <ul className="flex flex-wrap gap-2">
            {inferredTags.map((tag, i) => (
              <li
                key={`${tag}-${i}`}
                className="rounded-full px-3 py-1 text-xs"
                style={{ background: "#FFD6E0", color: "#E8775A" }}
              >
                {tag}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * PreferencePage — PreferenceProfile 表示 + DELETE (U7d FD §6).
 *
 * accepted_patterns / rejected_patterns は `{domain, keywords, persona_names, weight, decision_id, timestamp}`
 * の dict のリスト (U5 builder.py 構造)。集計して domain 別の出現頻度として表示する。
 * persona_style_preference は {persona_name: score in [-1, 1]} を bar graph で表示。
 * inferred_tags は string list、tag UI として表示。
 */
import { useState } from "react";
import { Button, Card, Modal, Skeleton, useToast } from "@yesman/ui";
import { usePreference, useResetPreference } from "./usePreference";
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

function aggregateByDomain(patterns: PatternDict[]): { domain: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const p of patterns) {
    const d = p.domain ?? "(unknown)";
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

export default function PreferencePage() {
  const { data, isPending } = usePreference();
  const reset = useResetPreference();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  const handleReset = async () => {
    try {
      await reset.mutateAsync();
      push({ message: t("resetSuccess"), variant: "success" });
      setModalOpen(false);
    } catch (err) {
      push({ message: String(err), variant: "error" });
    }
  };

  if (isPending) return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
  if (!data) return <p className="text-neutral-500">{t("empty")}</p>;

  const profile = data as ProfileShape;
  const accepted = profile.accepted_patterns ?? [];
  const rejected = profile.rejected_patterns ?? [];
  const personaStyle = profile.persona_style_preference ?? {};
  const inferredTags = profile.inferred_tags ?? [];

  const acceptedDomains = aggregateByDomain(accepted);
  const rejectedDomains = aggregateByDomain(rejected);
  const personaEntries = Object.entries(personaStyle).sort((a, b) => b[1] - a[1]);
  const isEmpty =
    accepted.length === 0 &&
    rejected.length === 0 &&
    personaEntries.length === 0 &&
    inferredTags.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>
        <Button variant="danger" size="sm" onClick={() => setModalOpen(true)}>
          {t("resetButton")}
        </Button>
      </div>

      {isEmpty && (
        <p className="text-sm text-neutral-500 italic">{t("empty")}</p>
      )}

      {/* 採択された傾向 — domain 別の集計 */}
      <Card>
        <h2 className="font-serif font-semibold mb-2 text-success">
          ✓ {t("labelAccepted")}
          <span className="ml-2 text-xs text-neutral-500 font-normal">
            (計 {accepted.length} 件)
          </span>
        </h2>
        {acceptedDomains.length === 0 ? (
          <p className="text-sm text-neutral-400 italic">まだデータがありません</p>
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
        <h2 className="font-serif font-semibold mb-2 text-silence">
          ✕ {t("labelRejected")}
          <span className="ml-2 text-xs text-neutral-500 font-normal">
            (計 {rejected.length} 件)
          </span>
        </h2>
        {rejectedDomains.length === 0 ? (
          <p className="text-sm text-neutral-400 italic">まだデータがありません</p>
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
        <h2 className="font-serif font-semibold mb-2">🎭 {t("labelPersonaStyle")}</h2>
        {personaEntries.length === 0 ? (
          <p className="text-sm text-neutral-400 italic">まだデータがありません</p>
        ) : (
          <dl className="flex flex-col gap-2">
            {personaEntries.map(([name, score]) => {
              const pct = Math.abs(score) * 100;
              const isPositive = score >= 0;
              return (
                <div key={name} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2">
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
          <h2 className="font-serif font-semibold mb-2">🏷️ {t("labelInferredTags")}</h2>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("resetButton")}>
        <p className="text-neutral-700 mb-3">{t("resetConfirm")}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleReset} loading={reset.isPending}>
            {t("resetButton")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * ScorePage — 主体性スコア表示 (U7d FD §5 + ultrathink Imp2: threshold UI).
 */
import { Card, Spinner } from "@yesman/ui";
import { useScore } from "./useScore";
import { getScoreLevel } from "./scoreLevel";
import { t } from "./strings";

export default function ScorePage() {
  const { data, isPending, isError } = useScore();

  if (isPending) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-danger" role="alert">{t("empty")}</p>;
  }

  const level = getScoreLevel(data.no_count, data.ratio);
  const ratioPercent = data.ratio !== null ? Math.round(data.ratio * 100) : null;

  const borderClass =
    level === "danger" ? "border-l-4 border-danger" :
    level === "warning" ? "border-l-4 border-warning" : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>
      <Card className={borderClass}>
        {level === "danger" && (
          <p className="text-danger font-bold mb-2" role="alert">
            {t("warningNoStreak")}
          </p>
        )}
        {level === "warning" && (
          <p className="text-warning mb-2">{t("warningHighNoRatio")}</p>
        )}

        {/* INCEPTION screen-04: 大きな % 表示 (委任度 = No 比率) + ラベル */}
        <div className="flex flex-col items-center py-4">
          <div className="font-mono text-6xl font-bold text-warning">
            {ratioPercent !== null ? `${ratioPercent}%` : "0%"}
          </div>
          <div className="mt-2 text-sm text-neutral-700">{t("metricLabel")}</div>
        </div>

        {/* AI 生成可変コメント (INCEPTION では大きく italic 風) */}
        <p className="mt-3 text-center font-serif italic text-neutral-700 dark:text-neutral-300">
          「{data.message}」
        </p>

        {/* 詳細 stats: 総決定 / Yes / No */}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm text-center">
          <div>
            <dt className="text-neutral-400">{t("labelTotal")}</dt>
            <dd className="font-mono text-lg">{data.total}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Yes</dt>
            <dd className="font-mono text-lg text-success">
              {data.total - data.no_count}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-400">{t("labelNoCount")}</dt>
            <dd className="font-mono text-lg text-silence">{data.no_count}</dd>
          </div>
        </dl>
      </Card>

      {/* INCEPTION footnote: スコアの解釈ガイド */}
      <p className="text-center text-xs italic text-neutral-400">
        {t("footnote")}
      </p>

      {/* drawio B6: 逆説的設計の明示 (主体性スコア = 元の name)、起動時 onboarding でも提示済 */}
      <p className="text-center text-xs italic text-neutral-500">
        {t("paradoxNote")}
      </p>
    </div>
  );
}

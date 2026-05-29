/**
 * ScorePage — 委任度スコア表示 (INCEPTION screen-04 完全準拠 / Yes 比率モデル).
 *
 * 構成:
 *   1. 円形プログレスチャート (ScoreRadialChart、紫色 #9F88C8)
 *   2. AI 生成可変コメント (ピンクバブル #FFD6E0 / border #FF8FAE)
 *   3. 📈 推移 (30日) 折れ線グラフ (ScoreLineChart、coral #E8775A)
 *   4. inline 統計 (総決定 / Yes / No)
 *   5. footnote (スコアが たかいほど AI を信頼できています)
 *   6. paradox / 解釈ガイド
 */
import { Card, Skeleton } from "@yesman/ui";
import { useScore } from "./useScore";
import { getScoreLevel } from "./scoreLevel";
import { ScoreRadialChart } from "./ScoreRadialChart";
import { ScoreLineChart } from "./ScoreLineChart";
import { DecisionHistoryList } from "./DecisionHistoryList";
import { PreferenceTrends } from "../preference/PreferenceTrends";
import { t } from "./strings";

export default function ScorePage() {
  const { data, isPending, isError } = useScore();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" style={{ borderRadius: 16 }} />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-48" />
        <div className="flex flex-col gap-2 mt-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-danger" role="alert">{t("empty")}</p>;
  }

  const level = getScoreLevel(data.no_count, data.ratio);
  const yesCount = data.total - data.no_count;

  const borderClass =
    level === "danger" ? "border-l-4 border-danger" :
    level === "warning" ? "border-l-4 border-warning" : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-sans text-lg font-bold">{t("pageTitle")}</h1>

      <Card className={borderClass}>
        {level === "danger" && (
          <p className="text-danger font-bold mb-2" role="alert">
            {t("warningNoStreak")}
          </p>
        )}
        {level === "warning" && (
          <p className="text-warning mb-2">{t("warningLowYesRatio")}</p>
        )}

        {/* INCEPTION screen-04 (1): 円形プログレスチャート (radial) */}
        <div className="flex justify-center py-2">
          <ScoreRadialChart ratio={data.ratio} caption={t("metricLabel")} />
        </div>

        {/* INCEPTION screen-04 (2): AI 生成可変コメント (pink bubble) */}
        <div
          className="mt-3 rounded-2xl border px-4 py-3 text-center"
          style={{ background: "#FFD6E0", borderColor: "#FF8FAE" }}
          role="region"
          aria-label="AI コメント"
        >
          <p
            className="text-sm font-semibold"
            style={{ color: "#E8775A" }}
          >
            「{data.message}」
          </p>
        </div>

        {/* INCEPTION screen-04 (3): 📈 推移 (30日) 折れ線グラフ */}
        {data.history.length > 0 && (
          <div className="mt-4">
            <ScoreLineChart history={data.history} />
          </div>
        )}

        {/* INCEPTION screen-04 (4): inline 統計 */}
        <p className="mt-4 text-xs text-neutral-600">
          {t("labelTotal")}:{" "}
          <span className="font-bold font-mono text-neutral-900">{data.total}</span>{" "}
          / Yes:{" "}
          <span className="font-bold font-mono text-success">{yesCount}</span>{" "}
          / {t("labelNoCount")}:{" "}
          <span className="font-bold font-mono text-silence">{data.no_count}</span>
        </p>
      </Card>

      {/* INCEPTION screen-04 (5): footnote */}
      <p className="text-center text-xs text-neutral-400">
        {t("footnote")}
      </p>

      {/* INCEPTION screen-04 (6): 解釈ガイド (Yes 比率モデルの説明) */}
      <p className="text-center text-xs text-neutral-500">
        {t("paradoxNote")}
      </p>

      {/* 2026-05-24: 過去の傾向 (PreferenceTrends を ScorePage に embed).
          採択 / 棄却 / ペルソナ嗜好 / 推定タグ を表示 (詳細編集は /preferences). */}
      <section className="flex flex-col gap-2">
        <h2 className="font-sans text-base font-bold">📊 過去の傾向</h2>
        <PreferenceTrends density="compact" />
      </section>

      {/* spec 2026-05-22-score-decision-history: Yes 採択履歴 (最大 20 件) */}
      <DecisionHistoryList />
    </div>
  );
}

/**
 * ScoreLineChart — INCEPTION screen-04 完全準拠の時系列折れ線グラフ.
 *
 * 仕様 (04-score-dashboard.svg "📈 推移 (30日)"):
 *   - 白背景の rounded box、灰グリッドライン × 3
 *   - 折れ線: coral #E8775A、stroke-width 2.5
 *   - 各点に小さな circle (r=2)
 *   - y 軸: 0..1 の Yes 比率 (上端が 100%、下端が 0%)
 *   - x 軸: 30 日分のバケット、左から右へ古い→新しい
 */
import type { Score } from "@yesman/api-client";

export interface ScoreLineChartProps {
  history: Score["history"];
  title?: string;
}

const W = 320;
const H = 120;
const PAD_X = 16;
const PAD_Y = 12;
const LINE_COLOR = "#E8775A";
const GRID = "#EEEEEE";
const BG = "#FFFFFF";
const BORDER = "#E0D5BC";
const LABEL = "#9E9E9E";

export function ScoreLineChart({ history, title = "📈 推移 (30日)" }: ScoreLineChartProps) {
  const points = history.filter((p) => p.yes_ratio !== null);
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const xs = history.length > 1 ? innerW / (history.length - 1) : innerW;
  const yFor = (r: number) => PAD_Y + (1 - r) * innerH;
  const polyline = points
    .map((p) => {
      const idx = history.indexOf(p);
      const x = PAD_X + idx * xs;
      const y = yFor(p.yes_ratio as number);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const firstDate = history[0]?.date;
  const lastDate = history[history.length - 1]?.date;

  return (
    <div className="flex flex-col gap-1" aria-label={title}>
      <p className="text-xs font-bold text-neutral-700">{title}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Yes 比率の 30 日推移グラフ"
        preserveAspectRatio="none"
        className="rounded-lg"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        {/* gridlines (0%, 50%, 100%) */}
        <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke={GRID} />
        <line x1={PAD_X} y1={PAD_Y + innerH / 2} x2={W - PAD_X} y2={PAD_Y + innerH / 2} stroke={GRID} />
        <line x1={PAD_X} y1={PAD_Y + innerH} x2={W - PAD_X} y2={PAD_Y + innerH} stroke={GRID} />
        {/* polyline */}
        {points.length >= 2 && (
          <polyline
            points={polyline}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* dots */}
        {points.map((p) => {
          const idx = history.indexOf(p);
          const x = PAD_X + idx * xs;
          const y = yFor(p.yes_ratio as number);
          return <circle key={p.date} cx={x} cy={y} r="2.5" fill={LINE_COLOR} />;
        })}
        {/* y-axis tick labels */}
        <text x={PAD_X - 4} y={PAD_Y + 3} fontSize="8" fill={LABEL} textAnchor="end">100%</text>
        <text x={PAD_X - 4} y={PAD_Y + innerH / 2 + 3} fontSize="8" fill={LABEL} textAnchor="end">50%</text>
        <text x={PAD_X - 4} y={PAD_Y + innerH + 3} fontSize="8" fill={LABEL} textAnchor="end">0%</text>
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-400 px-1">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

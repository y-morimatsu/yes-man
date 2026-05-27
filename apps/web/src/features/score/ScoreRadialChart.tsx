/**
 * ScoreRadialChart — INCEPTION screen-04 完全準拠の円形プログレスチャート.
 *
 * 仕様 (04-score-dashboard.svg):
 *   - circle r=62、stroke-width=10
 *   - 背景円: #DCCDEC (薄紫)
 *   - 前景アーク: #9F88C8 (紫)、yes_ratio に応じた周長
 *   - 中央: 数字 (font-size 34、font-weight 800、color #9F88C8) + % (相対)
 *   - 直下キャプション: 「委任度 (Yes 比率)」 (font-size 9、color #715B62)
 */

export interface ScoreRadialChartProps {
  /** Yes 比率 0..1 (null は履歴なし) */
  ratio: number | null;
  caption: string;
}

const RADIUS = 62;
const CIRC = 2 * Math.PI * RADIUS;
const ARC_BG = "#DCCDEC";
const ARC_FG = "#9F88C8";
const CAP_COLOR = "#715B62";

export function ScoreRadialChart({ ratio, caption }: ScoreRadialChartProps) {
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  const dash = ratio === null ? 0 : ratio * CIRC;
  return (
    <svg
      viewBox="-80 -80 160 160"
      width="160"
      height="160"
      role="img"
      aria-label={`委任度 ${pct}%`}
      className="block"
    >
      {/* 背景の円 (full ring) */}
      <circle r={RADIUS} fill="none" stroke={ARC_BG} strokeWidth="10" />
      {/* 前景の弧 (yes_ratio 分だけ進む). 12時方向から時計回り */}
      <circle
        r={RADIUS}
        fill="none"
        stroke={ARC_FG}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRC - dash}`}
        strokeDashoffset={CIRC / 4}
        transform="rotate(-90)"
      />
      {/* 中央: 数字 + % (2026-05-26: 3 桁 (100) で重なる issue 解消のため
          tspan superscript で 1 つの text にまとめて center 揃え). */}
      <text
        x="0"
        y="8"
        textAnchor="middle"
        fontSize="34"
        fontWeight="800"
        fill={ARC_FG}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {pct}
        <tspan
          fontSize="15"
          fontWeight="700"
          dx="2"
          dy="-12"
          fontFamily="system-ui, sans-serif"
        >
          %
        </tspan>
      </text>
      {/* キャプション (2026-05-27 typography-redesign: 10→12px で読みやすく) */}
      <text x="0" y="34" textAnchor="middle" fontSize="12" fill={CAP_COLOR}>
        {caption}
      </text>
    </svg>
  );
}

/**
 * HomePage — mockup §4 通り (2026-05-24 visual overhaul).
 *
 * mockup §4 構成:
 *   - 「決めてもらう人」 card
 *     - 「決めてもらう人」 label + 3 アバター stack (T + orange blob + blue blob) + ↻
 *     - 入力 box (cream-lt + green mic)
 *     - 「決めてもらう」 黒楕円 button (Crimson Pro italic)
 *   - 「最近の決定」 section + 履歴 list (3 件)
 *   - 「委任率 N%」 strip (cream-lt 背景、orange % text)
 */
import { useNavigate } from "react-router-dom";
import { useScore } from "../score/useScore";
import { useDecisionHistory } from "../decision/useDecision";
import { SelectedPersonaAvatars } from "../persona/SelectedPersonaAvatars";
import { PersonaIcon } from "../../shell/icons";

const MK_CREAM_LT = "#FFFCF4";
const MK_UMBER = "#2E2418";
const MK_ORANGE = "#EF7A62";
const MK_HAIRLINE = "rgba(46, 36, 24, 0.15)";
const MK_HAIRLINE_2 = "rgba(46, 36, 24, 0.08)";
const MK_MUTED = "rgba(46, 36, 24, 0.55)";

function relativeFromIso(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400_000);
  if (d <= 0) return "今日";
  if (d === 1) return "昨日";
  if (d === 2) return "一昨日";
  if (d < 7) return `${d} 日前`;
  if (d < 30) return `${Math.floor(d / 7)} 週間前`;
  return `${Math.floor(d / 30)} か月前`;
}

const CHECK_COLORS = ["#21A48F", "#EF7A62", "#8AB2DF"]; // green / orange / blue (mockup §4)

export default function HomePage() {
  const navigate = useNavigate();
  const { data: score } = useScore();
  // 履歴: API があれば取得 (mockup は最大 3 件表示)
  const history = useDecisionHistory({ limit: 3 });

  const decisions = history.data?.items ?? [];

  const handleDecide = () => navigate("/decision");
  const handleShuffleMembers = () => navigate("/personas/selection");

  const ratioPct =
    score && score.ratio !== null ? Math.round(score.ratio * 100) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="home-page">
      {/* 委任率 / welcome strip — 2026-05-24: 先頭配置 (achievement を最初に visible 化) */}
      {score && score.total === 0 ? (
        // 新規ユーザー (まだ 1 度も委任していない) 専用 welcome strip.
        //   委任率 % は意味がないため、代わりに onboarding メッセージで「最初の決定」を促す.
        <div
          className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
          style={{
            background: MK_CREAM_LT,
            border: `0.5px solid ${MK_HAIRLINE_2}`,
          }}
          data-testid="home-welcome-strip"
        >
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: MK_MUTED }}
          >
            はじめまして
          </span>
          <span
            aria-hidden
            className="text-lg"
            style={{ color: MK_ORANGE }}
          >
            ✨
          </span>
          <span
            className="ml-auto text-[10px] leading-relaxed text-right"
            style={{
              fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
              fontStyle: "italic",
              color: MK_MUTED,
            }}
          >
            下の「決めてもらう」を押すと、
            <br />3 人で あなたの決定を 任されます。
          </span>
        </div>
      ) : (
        ratioPct !== null && (
          <div
            className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
            style={{
              background: MK_CREAM_LT,
              border: `0.5px solid ${MK_HAIRLINE_2}`,
            }}
            data-testid="home-score-strip"
          >
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: MK_MUTED }}
            >
              委任率
            </span>
            <span
              className="text-lg font-medium"
              style={{
                fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
                fontStyle: "italic",
                color: MK_ORANGE,
              }}
            >
              {ratioPct}%
            </span>
            <span
              className="ml-auto text-[10px]"
              style={{
                fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
                fontStyle: "italic",
                color: MK_MUTED,
              }}
            >
              {score?.message ?? "うまく任せられてます"}
            </span>
          </div>
        )
      )}

      {/* 「決めてもらう人」 card */}
      <section
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ background: MK_CREAM_LT, border: `0.5px solid ${MK_HAIRLINE}` }}
        data-testid="home-call-card"
      >
        <div
          className="flex items-center gap-2.5 pb-2.5"
          style={{ borderBottom: `0.5px solid ${MK_HAIRLINE_2}` }}
        >
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: MK_MUTED }}
          >
            決めてもらう人
          </span>
          {/* 2026-05-24 v4: hardcoded → unified selection (3 source mix) を動的表示.
              0 件時は「人を選ぶ →」 placeholder (PersonaSelectionPage への Link). */}
          <SelectedPersonaAvatars size={28} />

          <button
            type="button"
            onClick={handleShuffleMembers}
            aria-label="決めてもらう人を変更"
            data-testid="home-shuffle-members"
            className="ml-auto inline-flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
            style={{
              width: 32,
              height: 32,
              background: MK_CREAM_LT,
              border: `0.5px solid ${MK_HAIRLINE}`,
              color: MK_ORANGE,
            }}
          >
            <PersonaIcon size={18} />
          </button>
        </div>

        {/* 「決めてもらう」 黒楕円 button */}
        <button
          type="button"
          onClick={handleDecide}
          data-testid="home-decide"
          className="w-full rounded-full py-3.5 transition-opacity hover:opacity-90"
          style={{
            background: MK_UMBER,
            color: "#FAF6EC",
            fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
            fontStyle: "italic",
            fontSize: 14,
            letterSpacing: "0.05em",
            fontWeight: 500,
          }}
        >
          決めてもらう
        </button>
      </section>

      {/* 最近の決定 section */}
      <div className="flex flex-col gap-1">
        <p
          className="text-[9px] uppercase tracking-widest px-1"
          style={{ color: MK_MUTED }}
        >
          最近の決定
        </p>
        <ul className="flex flex-col" data-testid="home-history">
          {decisions.length === 0 ? (
            <li
              className="text-xs italic py-3"
              style={{ color: MK_MUTED }}
            >
              (まだ決定がありません)
            </li>
          ) : (
            decisions.map((d, idx) => (
              <li
                key={d.id}
                className="flex items-center gap-2.5 py-2"
                style={{ borderBottom: `0.5px solid ${MK_HAIRLINE_2}` }}
              >
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center rounded-full text-white text-[10px] shrink-0"
                  style={{
                    width: 16,
                    height: 16,
                    background:
                      CHECK_COLORS[idx % CHECK_COLORS.length] ?? CHECK_COLORS[0]!,
                  }}
                >
                  ✓
                </span>
                <span
                  className="flex-1 text-xs"
                  style={{
                    fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
                    fontStyle: "italic",
                    color: MK_UMBER,
                  }}
                >
                  {d.proposal_text}
                </span>
                <span
                  className="text-[9px] tracking-wide"
                  style={{ color: MK_MUTED }}
                >
                  {relativeFromIso(d.created_at)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

    </div>
  );
}

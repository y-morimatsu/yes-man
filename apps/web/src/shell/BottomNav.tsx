/**
 * BottomNav — 4-tab Mobile Navigation Bar (spec 2026-05-22 §4).
 *
 * fixed bottom-0、safe-area-inset-bottom 対応、active tab は brand-700 太字 + 上 2px underline.
 * 2026-05-24 v3: icon を SVG 化 (mockup の warm / organic / blob-style に合わせて手描き風).
 * 2026-05-24 v4: icon を shell/icons.tsx に extract (HomePage 等で再利用).
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { HomeIcon, PersonaIcon, ProfileIcon, ScoreIcon } from "./icons";

const TAB_ICONS: Record<string, ReactNode> = {
  Home: <HomeIcon />,
  スコア: <ScoreIcon />,
  ペルソナ: <PersonaIcon />,
  プロフィール: <ProfileIcon />,
};

// 2026-05-24 v2: 「ペルソナ」 tab を追加. 4-tab 構成.
//   Home / スコア / ペルソナ / プロフィール
//   ペルソナ tab は /personas/selection に navigate (3 source mix の合議メンバー選択).
//   /personas, /personas/selection, /personas/* (詳細) で active.
type Tab = { to: string; label: string; activePaths?: string[] };

const TABS: Tab[] = [
  { to: "/", label: "Home" },
  { to: "/score", label: "スコア" },
  {
    to: "/personas/selection",
    label: "ペルソナ",
    activePaths: ["/personas"],
  },
  { to: "/profile", label: "プロフィール" },
];

const MK_CREAM_LT = "#FAF6EC";
const MK_ORANGE = "#EF7A62";
const MK_MUTED = "rgba(46, 36, 24, 0.55)";
const MK_HAIRLINE_2 = "rgba(46, 36, 24, 0.08)";

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.to === "/") return pathname === "/";
  const candidates = tab.activePaths ?? [tab.to];
  return candidates.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40"
      style={{
        background: MK_CREAM_LT,
        borderTop: `0.5px solid ${MK_HAIRLINE_2}`,
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingTop: "0.5rem",
      }}
      aria-label="メインナビゲーション"
    >
      <ul className="flex max-w-md mx-auto">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.to} className="flex-1 relative">
              <Link
                to={tab.to}
                viewTransition
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 min-h-[56px] active:opacity-70"
                style={{ color: active ? MK_ORANGE : MK_MUTED }}
              >
                {/* 2026-05-24 v3: SVG icon (warm/organic style、currentColor で active 色追従) */}
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center"
                  style={{ opacity: active ? 1 : 0.7 }}
                >
                  {TAB_ICONS[tab.label]}
                </span>
                <span className="text-[10px] leading-tight tracking-wide">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

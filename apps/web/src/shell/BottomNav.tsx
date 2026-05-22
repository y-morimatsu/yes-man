/**
 * BottomNav — 4-tab Mobile Navigation Bar (spec 2026-05-22 §4).
 *
 * fixed bottom-0、safe-area-inset-bottom 対応、active tab は brand-700 太字 + 上 2px underline.
 * Persona / Preferences は本 nav に含まず、Home Hub の nav card 経由でアクセス。
 */
import { Link, useLocation } from "react-router-dom";

type Tab = { to: string; icon: string; label: string };

const TABS: Tab[] = [
  { to: "/",         icon: "🏠", label: "Home" },
  { to: "/decision", icon: "💭", label: "決定" },
  { to: "/score",    icon: "📊", label: "スコア" },
  { to: "/profile",  icon: "👤", label: "プロフィール" },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingTop: "0.5rem",
      }}
      aria-label="メインナビゲーション"
    >
      <ul className="flex max-w-md mx-auto">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.to);
          return (
            <li key={tab.to} className="flex-1 relative">
              {active && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-brand-700"
                  aria-hidden="true"
                />
              )}
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={
                  "flex flex-col items-center justify-center gap-0.5 min-h-[56px] active:opacity-70 " +
                  (active ? "text-brand-700 font-bold" : "text-neutral-500")
                }
              >
                <span className="text-2xl leading-none" aria-hidden="true">{tab.icon}</span>
                <span className="text-xs leading-tight">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

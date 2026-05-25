/**
 * Layout — global sticky header + BottomNav + Suspense Outlet.
 *
 * spec 2026-05-22 mobile-app-polish §3:
 * - Sticky header (logo + Sign out のみ、nav icons は BottomNav に移行)
 * - Safe Area Insets (env(safe-area-inset-*))
 * - BottomNav 配置 + main の pb で BottomNav 回避
 */
import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { Button, Spinner } from "@yesman/ui";
import { signOutUser } from "./auth";
import { useAuth } from "./AuthProvider";
import { BottomNav } from "./BottomNav";

export function Layout() {
  const { status, refresh } = useAuth();

  const handleSignOut = async () => {
    await signOutUser();
    await refresh();
  };

  const isAuthed = status === "authenticated";

  // 2026-05-24: mockup §4-§11 palette 統一. body 全体に cream-light、main は phone frame 風 cream-lt.
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#F2EEE2", color: "#2E2418" }}
    >
      {/* Sticky Header — logo + Sign out のみ.
          2026-05-24: mobile fit のため padding と logo を圧縮 (高さ ~64px → ~44px). */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "#FAF6EC",
          color: "#2E2418",
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          paddingBottom: "0.5rem",
          borderBottom: "0.5px solid rgba(46, 36, 24, 0.08)",
        }}
      >
        <div className="flex justify-between items-center max-w-md mx-auto w-full px-4">
          <Link
            to="/"
            viewTransition
            className="text-base font-bold active:opacity-70 leading-none"
            style={{
              fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
              fontStyle: "italic",
              color: "#2E2418",
            }}
          >
            YesMan
          </Link>
          {isAuthed && (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          )}
        </div>
      </header>

      {/* Main content — phone frame 風 cream-lt 背景、pb で BottomNav 回避 */}
      <main
        className="flex-1 px-4 pt-4 max-w-md mx-auto w-full"
        style={{
          background: "#FAF6EC",
          color: "#2E2418",
          paddingBottom: isAuthed
            ? "calc(56px + env(safe-area-inset-bottom) + 1rem)"
            : "1rem",
        }}
      >
        <Suspense
          fallback={
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Bottom Navigation (認証時のみ) */}
      {isAuthed && <BottomNav />}
    </div>
  );
}

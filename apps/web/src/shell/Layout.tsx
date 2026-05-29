/**
 * Layout — BottomNav + Suspense Outlet.
 *
 * spec 2026-05-22 mobile-app-polish §3 + 2026-05-26 update:
 * - ヘッダー廃止 (YesMan logo は BottomNav の Home と重複、Sign out は Profile 画面に移管)
 * - Safe Area Insets は main の padding-top で吸収
 * - BottomNav 配置 + main の pb で BottomNav 回避
 */
import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Spinner } from "@yesman/ui";
import { useAuth } from "./AuthProvider";
import { BottomNav } from "./BottomNav";

export function Layout() {
  const { status } = useAuth();
  const isAuthed = status === "authenticated";

  // 2026-05-24: mockup §4-§11 palette 統一. body 全体に cream-light、main は phone frame 風 cream-lt.
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#F2EEE2", color: "#2E2418" }}
    >
      {/* Main content — phone frame 風 cream-lt 背景、pb で BottomNav 回避.
          ヘッダー廃止に伴い、safe-area-inset-top は main の padding-top で吸収. */}
      <main
        className="flex-1 px-4 max-w-md mx-auto w-full"
        style={{
          background: "#FAF6EC",
          color: "#2E2418",
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))",
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

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

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-800">
      {/* Sticky Header — logo + Sign out のみ簡素化、nav は BottomNav に */}
      <header
        className="sticky top-0 z-40 text-neutral-800"
        style={{
          background: "#F5E5C4",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "1rem",
        }}
      >
        <div className="flex justify-between items-center max-w-md mx-auto w-full px-4">
          <Link
            to="/"
            className="font-serif text-xl font-bold text-neutral-800 active:opacity-70"
          >
            🪞 YesMan
          </Link>
          {isAuthed && (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          )}
        </div>
      </header>

      {/* Main content — pb で BottomNav (~88px) + safe-area-inset-bottom を回避 */}
      <main
        className="flex-1 px-4 pt-4 max-w-md mx-auto w-full bg-neutral-50 text-neutral-800"
        style={{
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

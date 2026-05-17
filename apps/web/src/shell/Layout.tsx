/**
 * Layout — global header + Suspense Outlet (FD §6.2 + ultrathink I2).
 */
import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { Button, Spinner } from "@yesman/ui";
import { signOutUser } from "./auth";
import { useAuth } from "./AuthProvider";

export function Layout() {
  const { status } = useAuth();
  return (
    // INCEPTION §1.2: 背景 Light = #FFF7E8 warm cream (neutral-50 を INCEPTION で remap 済)
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-800">
      {/* INCEPTION screen-01..06 共通 header: beige (#F5E5C4)、ロゴ + 3 nav icons (⚙️📊👤) + sign out */}
      <header className="bg-neutral-100 text-neutral-800 p-4">
        <div className="flex justify-between items-center max-w-4xl mx-auto w-full">
          <Link to="/" className="font-serif text-xl font-bold text-neutral-800">
            🪞 YesMan
          </Link>
          {status === "authenticated" && (
            <nav className="flex items-center gap-3">
              <Link
                to="/profile"
                aria-label="設定"
                className="text-lg hover:opacity-70"
              >
                ⚙️
              </Link>
              <Link
                to="/score"
                aria-label="委任度スコア"
                className="text-lg hover:opacity-70"
              >
                📊
              </Link>
              <Link
                to="/profile"
                aria-label="ユーザー"
                className="text-lg hover:opacity-70"
              >
                👤
              </Link>
              <Button variant="ghost" size="sm" onClick={signOutUser}>
                Sign out
              </Button>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full bg-neutral-50 text-neutral-800">
        {/* ultrathink FD I2: lazy route の chunk 読込中 fallback */}
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
    </div>
  );
}

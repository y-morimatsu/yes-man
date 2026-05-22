/**
 * Layout — global header + Suspense Outlet (FD §6.2 + ultrathink I2).
 */
import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { Button, Spinner } from "@yesman/ui";
import { signOutUser } from "./auth";
import { useAuth } from "./AuthProvider";

export function Layout() {
  const { status, refresh } = useAuth();

  const handleSignOut = async () => {
    await signOutUser();
    await refresh();
    // RequireAuth が status=unauthenticated を detect し /auth/signin redirect
  };

  return (
    // INCEPTION §1.2: 背景 Light = #FFF7E8 warm cream (neutral-50 を INCEPTION で remap 済)
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-800">
      {/* INCEPTION screen-01..06 共通 header: warm beige #F5E5C4 (FE-DESIGN-03 palette adherence) */}
      <header
        className="text-neutral-800 p-4"
        style={{ background: "#F5E5C4" }}
      >
        <div className="flex justify-between items-center max-w-md mx-auto w-full">
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
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </nav>
          )}
        </div>
      </header>
      {/* FE-DESIGN-05: Mobile-First Viewport — max-width: 480px に制限 (ui-mockups.md §5) */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full bg-neutral-50 text-neutral-800">
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

/**
 * RequireAuth — auth guard (FD §5.3).
 *
 * AuthProvider の status を読むだけ、route 切替で fetch 再実行しない (flicker 解消).
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@yesman/ui";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (status === "unauthenticated") {
    // spec 2026-05-21: redirect 先を /auth/splash に変更 (Splash → SignIn の 2 段構え).
    // location オブジェクト全体を state.from として渡すが、SplashPage では .pathname のみ
    // 引き継ぐ (search/hash は spec §4.3 で非対応とした意図的な簡略化).
    return <Navigate to="/auth/splash" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

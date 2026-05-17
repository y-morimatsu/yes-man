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
    // ultrathink FD Imp2: state.from で元 page を保持、sign-in 後復帰
    return <Navigate to="/auth/signin" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

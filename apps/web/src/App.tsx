/**
 * App.tsx — Provider stack (U7a NFR Design §7 + U7d NFR Design §4).
 *
 * Provider 順序 (outer → inner):
 *   ErrorBoundary > ToastProvider > AuthProvider > ApiProvider > QueryProvider > RouterProvider
 *
 * ultrathink:
 * - U7a Imp1: ToastProvider を AuthProvider より outside で auth 失敗時の toast 表示確保
 * - U7d Imp2: QueryProvider は順序自由、ここでは ApiProvider 内側で useQuery 内から useApi 呼び出し可能
 */
import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";
import { AuthProvider } from "./shell/AuthProvider";
import { ApiProvider } from "./shell/ApiProvider";
import { QueryProvider } from "./shell/QueryProvider";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { router } from "./shell/routes";

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ApiProvider>
            <QueryProvider>
              <RouterProvider router={router} />
            </QueryProvider>
          </ApiProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

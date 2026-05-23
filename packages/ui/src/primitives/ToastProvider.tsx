/**
 * ToastProvider — Context provider + viewport (NFR Design §6).
 *
 * ultrathink I2 (NFR Design): counter ベース ID (crypto.randomUUID SSR 非依存).
 * "use client" directive for Next.js App Router 互換.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Toast, type ToastItem } from "./Toast";

export interface ToastContextValue {
  push: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed right-4 flex flex-col gap-2 z-50"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 0.5rem)" }}
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

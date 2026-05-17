/**
 * Toast — primitive (NFR Design §6、role="status").
 */
import { useEffect } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const VARIANTS: Record<ToastVariant, string> = {
  success: "bg-success text-neutral-0",
  error: "bg-danger text-neutral-0",
  info: "bg-info text-neutral-0",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.durationMs ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl p-3 shadow ${VARIANTS[toast.variant ?? "info"]}`}
    >
      {toast.message}
    </div>
  );
}

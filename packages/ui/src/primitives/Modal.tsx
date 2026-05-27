/**
 * Modal — primitive、MVP-optional (FD §3.4 + ultrathink Imp1).
 *
 * `<dialog>` HTML element 採用、Tailwind の `backdrop:` で背景制御.
 * a11y: role="dialog" + focus trap (modal=true で browser-native trap).
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type ModalSize = "md" | "lg" | "xl" | "full";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * 2026-05-26: Modal 横幅. default "md" (max-w-md ~28rem) は既存挙動.
   * "lg" (~32rem) / "xl" (~36rem) / "full" (~94vw, max 680px) で form 多段の modal に対応.
   */
  size?: ModalSize;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "w-[94vw] max-w-[680px]",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // backdrop click で close (target が dialog 自身なら backdrop click)
        if (e.target === dialogRef.current) onClose();
      }}
      className={`rounded-2xl bg-neutral-0 dark:bg-neutral-800 p-6 ${SIZE_CLASS[size]} max-h-[90vh] overflow-y-auto backdrop:bg-black/50`}
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {title && (
        <h2 id="modal-title" className="text-xl font-semibold mb-3">
          {title}
        </h2>
      )}
      {children}
    </dialog>
  );
}

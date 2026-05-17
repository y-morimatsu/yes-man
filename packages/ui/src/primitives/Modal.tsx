/**
 * Modal — primitive、MVP-optional (FD §3.4 + ultrathink Imp1).
 *
 * `<dialog>` HTML element 採用、Tailwind の `backdrop:` で背景制御.
 * a11y: role="dialog" + focus trap (modal=true で browser-native trap).
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
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
      className="rounded-2xl bg-neutral-0 dark:bg-neutral-800 p-6 max-w-md backdrop:bg-black/50"
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

/**
 * Input — primitive、text/email/url etc.
 */
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ error, className, ...rest }: InputProps) {
  // INCEPTION screen-01: textarea/input border は warm beige (#E0D5BC = neutral-200)、bg は cream surface
  const base =
    "block w-full rounded-xl border bg-neutral-0 dark:bg-neutral-800 px-3 py-2 text-base focus:outline-none focus:ring-2 transition-colors";
  const errorClass = error
    ? "border-danger focus:ring-danger"
    : "border-neutral-200 dark:border-neutral-600 focus:ring-brand-500";
  return (
    <input
      {...rest}
      className={[base, errorClass, className].filter(Boolean).join(" ")}
    />
  );
}

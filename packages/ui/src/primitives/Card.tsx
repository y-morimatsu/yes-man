/**
 * Card — primitive、onClick + as polymorphic (ultrathink FD I3).
 *
 * onClick 指定時は `<button>` (a11y: keyboard focus + Enter activation)、
 * 未指定 or `as` で明示時は default <div>.
 */
import type { ReactNode } from "react";

export type CardElement = "div" | "button" | "article";

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: CardElement;
}

export function Card({ children, className, onClick, as }: CardProps) {
  const Element: CardElement = as ?? (onClick ? "button" : "div");
  const base = "rounded-2xl bg-neutral-0 dark:bg-neutral-800 shadow-sm p-4";
  const interactive = onClick
    ? "cursor-pointer hover:shadow-md transition-shadow text-left w-full"
    : "";
  const merged = [base, interactive, className].filter(Boolean).join(" ");

  if (Element === "button") {
    return (
      <button type="button" className={merged} onClick={onClick}>
        {children}
      </button>
    );
  }
  if (Element === "article") {
    return (
      <article className={merged} onClick={onClick}>
        {children}
      </article>
    );
  }
  return (
    <div className={merged} onClick={onClick}>
      {children}
    </div>
  );
}

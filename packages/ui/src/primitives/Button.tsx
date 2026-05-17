/**
 * Button — primitive、cva ベース.
 *
 * ultrathink:
 * - C1 (FD): class-variance-authority (cva) で variant × size × state 型安全
 * - I2 (NFR Req): brand-600 default で AA contrast 5.5:1 達成
 * - Imp2 (NFR Design): transition → transition-colors で intent 明示
 * - I1 (NFR Design): defensive ordering、rest 先 + explicit 後置で上書き安全
 */
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Spinner } from "./Spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-neutral-0 hover:bg-brand-700 active:bg-brand-700",
        // INCEPTION §1.2: Yes 強調 = 暖色グリーン #4CAF50 (success)
        success: "bg-success text-neutral-0 hover:opacity-90 active:opacity-90",
        secondary:
          "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-0",
        ghost:
          "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-0 dark:hover:bg-neutral-800",
        // INCEPTION §1.2: No 抑制 = cool grey #90A4AE (silence token と同)
        muted: "bg-silence text-neutral-0 hover:opacity-90",
        danger: "bg-danger text-neutral-0 hover:opacity-90",
      },
      size: {
        // WCAG 2.5.5 / Apple HIG: touch target は 44×44 px 以上 (mobile-first)
        // sm は secondary action のため 36px に緩和 (auxiliary、main CTA は md/lg)
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base", // 44px = touch target minimum
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={buttonVariants({ variant, size, className })}
      disabled={loading || disabled}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

/**
 * Spinner — loading indicator (Button.loading で使用).
 */
import { cva, type VariantProps } from "class-variance-authority";

const spinnerVariants = cva(
  "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        md: "h-6 w-6",
        lg: "h-8 w-8",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string;
  "aria-label"?: string;
}

export function Spinner({ size, className, "aria-label": ariaLabel = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={spinnerVariants({ size, className })}
    />
  );
}

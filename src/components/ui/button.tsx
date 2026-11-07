import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-white",
  ghost: "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-muted)]",
  danger: "bg-[var(--destructive-bg)] text-[var(--destructive)] border border-[var(--destructive)]/30 hover:bg-[var(--destructive-bg)] hover:text-[var(--destructive-hover)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

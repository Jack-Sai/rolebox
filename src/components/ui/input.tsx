import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none text-[var(--text)] focus:border-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}

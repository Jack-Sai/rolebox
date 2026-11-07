import { cn } from "../../lib/utils";

export interface ContextBarProps {
  used: number;
  limit: number;
  isAccurate: boolean;
}

/// 上下文进度条。used 来自真实 usage 时 isAccurate 为 true，否则是基于字符数的估算。
export function ContextBar({ used, limit, isAccurate }: ContextBarProps) {
  const percent =
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div
      className="flex items-center gap-3 border-b border-gray-100 bg-white px-6 py-1.5"
      data-testid="context-bar"
    >
      <div className="h-1.5 w-40 overflow-hidden rounded bg-gray-100">
        <div
          data-testid="context-fill"
          className={cn(
            "h-full rounded transition-all",
            percent >= 90
              ? "bg-red-500"
              : percent >= 70
                ? "bg-amber-500"
                : "bg-indigo-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-gray-500" data-testid="context-text">
        {used} / {limit} tokens
        {isAccurate ? "" : "（估算）"}
      </span>
    </div>
  );
}

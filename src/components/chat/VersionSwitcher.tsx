import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Message } from "../../types";

export interface VersionSwitcherProps {
  versions: Message[];
  currentId: number;
  onActivate: (messageId: number) => void;
}

/// 显示 `← 2/3 →`。切换只改 is_active，不改历史（DESIGN 9.3）。
export function VersionSwitcher({
  versions,
  currentId,
  onActivate,
}: VersionSwitcherProps) {
  if (versions.length <= 1) return null;

  const found = versions.findIndex((item) => item.id === currentId);
  const index = found >= 0 ? found : 0;
  const previous = versions[index - 1];
  const next = versions[index + 1];

  return (
    <div
      className="flex items-center gap-1 text-xs text-[var(--text-muted)]"
      data-testid="version-switcher"
    >
      <button
        type="button"
        aria-label="上一个版本"
        disabled={!previous}
        onClick={() => previous && onActivate(previous.id)}
        className="rounded p-0.5 hover:bg-[var(--surface-hover)] disabled:opacity-30"
      >
        <ChevronLeft size={14} />
      </button>
      <span data-testid="version-indicator">
        {index + 1}/{versions.length}
      </span>
      <button
        type="button"
        aria-label="下一个版本"
        disabled={!next}
        onClick={() => next && onActivate(next.id)}
        className="rounded p-0.5 hover:bg-[var(--surface-hover)] disabled:opacity-30"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

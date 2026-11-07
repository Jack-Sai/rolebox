import { useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

/// 旁白不是任何一方说的话，用居中斜体行表示，和左右气泡区分开。
/// 保留原来的居中斜体视觉，并和普通消息一样支持编辑、删除、复制。
/// 构造上下文时它会被转成 user + 【旁白】前缀（format_single_history）。
export interface NarrationLineProps {
  id: number;
  content: string;
  onEdit?: (id: number, content: string) => void;
  onDelete?: (id: number) => void;
}

export function NarrationLine({ id, content, onEdit, onDelete }: NarrationLineProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  const confirmEdit = () => {
    onEdit?.(id, draft);
    setEditing(false);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(content);
  };

  const editable = Boolean(onEdit || onDelete);

  return (
    <div className="flex justify-center" data-testid="narration-line">
      <div className="flex items-center gap-2">
        {editing ? (
          <div className="w-80 space-y-2">
            <textarea
              aria-label="编辑旁白"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full resize-none rounded-lg border border-[var(--border)] p-2 text-sm text-[var(--text)] focus:border-[var(--accent)]"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="rounded px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-[var(--accent)] px-2 py-1 text-white"
                onClick={confirmEdit}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <p className="max-w-[72%] whitespace-pre-wrap rounded-lg bg-[var(--surface-muted)] px-4 py-2 text-center text-xs italic text-[var(--text-muted)]">
              <span className="mr-1 text-[var(--icon-muted)] not-italic">旁白</span>
              {content}
            </p>
            {editable && (
              <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                {onEdit && (
                  <button
                    type="button"
                    aria-label="编辑"
                    className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    onClick={() => {
                      setDraft(content);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label="删除"
                    className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--destructive-bg)] hover:text-[var(--destructive)]"
                    onClick={() => onDelete?.(id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="复制"
                  className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  onClick={copy}
                >
                  <Copy size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

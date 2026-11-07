import { memo, useState, type ReactNode } from "react";
import { Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { VersionSwitcher } from "./VersionSwitcher";
import type { Message } from "../../types";

// 模块级函数：引用稳定。写在组件体内会让 React.memo 的浅比较恒不相等（坑 #12）。
export function defaultRenderContent(content: string): ReactNode {
  return content;
}

export interface MessageBubbleProps {
  message: Message;
  renderContent?: (content: string) => ReactNode;
  onEdit?: (id: number, content: string) => void;
  onDelete?: (id: number) => void;
  versions?: Message[];
  onActivateVersion?: (messageId: number) => void;
  onRegenerate?: (messageId: number) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  renderContent = defaultRenderContent,
  onEdit,
  onDelete,
  versions,
  onActivateVersion,
  onRegenerate,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isUser = message.role === "user";
  // 临时消息（id < 0）还在流式写入，不能编辑或删除。
  const editable =
    message.id > 0 &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "narration");

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const confirmEdit = () => {
    onEdit?.(message.id, draft);
    setEditing(false);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(message.content);
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-2",
        isUser && "flex-row-reverse",
      )}
      data-testid={`bubble-${message.id}`}
    >
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "max-w-full whitespace-pre-wrap rounded-xl px-4 py-2 text-sm",
            isUser
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
            message.role === "narration" && "italic text-[var(--text-muted)]",
            message.role === "summary" && "bg-[var(--muted-bg)] text-[var(--text-muted)]",
          )}
        >
          {editing ? (
            <div className="w-80 space-y-2">
              <textarea
                aria-label="编辑消息"
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none rounded-lg border border-[var(--border)] p-2 text-sm text-[var(--text)]"
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
            renderContent(message.content)
          )}
        </div>

        {versions && onActivateVersion && (
          <VersionSwitcher
            versions={versions}
            currentId={message.id}
            onActivate={onActivateVersion}
          />
        )}

        {/* deprecated 只是提示：这些消息生成时上下文已变，但下次请求仍会带上它们。 */}
        {message.deprecated && (
          <span
            data-testid="deprecated-mark"
            className="text-xs text-[var(--text-muted)]"
          >
            上下文已变
          </span>
        )}
      </div>

      <div className="flex shrink-0 gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
        {editable && !editing && (
          <button
            type="button"
            aria-label="编辑"
            className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            onClick={startEdit}
          >
            <Pencil size={14} />
          </button>
        )}
        {message.role === "assistant" && message.id > 0 && !editing && (
          <button
            type="button"
            aria-label="重新生成"
            className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            onClick={() => onRegenerate?.(message.id)}
          >
            <RefreshCw size={14} />
          </button>
        )}
        {editable && !editing && (
          <button
            type="button"
            aria-label="删除"
            className="rounded p-1 text-[var(--icon-muted)] hover:bg-[var(--destructive-bg)] hover:text-[var(--destructive)]"
            onClick={() => onDelete?.(message.id)}
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
    </div>
  );
});

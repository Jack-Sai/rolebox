import { memo, useState, type ReactNode } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
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
}

export const MessageBubble = memo(function MessageBubble({
  message,
  renderContent = defaultRenderContent,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isUser = message.role === "user";
  // 临时消息（id < 0）还在流式写入，不能编辑或删除。
  const editable =
    message.id > 0 && (message.role === "user" || message.role === "assistant");

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
              ? "bg-indigo-600 text-white"
              : "border border-gray-200 bg-white text-gray-800",
            message.role === "narration" && "italic text-gray-500",
            message.role === "summary" && "bg-amber-50 text-amber-800",
          )}
        >
          {editing ? (
            <div className="w-80 space-y-2">
              <textarea
                aria-label="编辑消息"
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none rounded-lg border border-indigo-200 p-2 text-sm text-gray-800"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
                  onClick={() => setEditing(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-2 py-1 text-white"
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

        {/* deprecated 只是提示：这些消息生成时上下文已变，但下次请求仍会带上它们。 */}
        {message.deprecated && (
          <span
            data-testid="deprecated-mark"
            className="text-xs text-amber-600"
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
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={startEdit}
          >
            <Pencil size={14} />
          </button>
        )}
        {editable && !editing && (
          <button
            type="button"
            aria-label="删除"
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            onClick={() => onDelete?.(message.id)}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          type="button"
          aria-label="复制"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          onClick={copy}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
});

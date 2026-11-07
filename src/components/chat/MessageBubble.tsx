import { memo, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { Message } from "../../types";

// 模块级函数：引用稳定。写在组件体内会让 React.memo 的浅比较恒不相等（坑 #12）。
export function defaultRenderContent(content: string): ReactNode {
  return content;
}

export interface MessageBubbleProps {
  message: Message;
  renderContent?: (content: string) => ReactNode;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  renderContent = defaultRenderContent,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
      data-testid={`bubble-${message.id}`}
    >
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap rounded-xl px-4 py-2 text-sm",
          isUser
            ? "bg-indigo-600 text-white"
            : "border border-gray-200 bg-white text-gray-800",
          message.role === "narration" && "italic text-gray-500",
          message.role === "summary" && "bg-amber-50 text-amber-800",
        )}
      >
        {renderContent(message.content)}
      </div>
    </div>
  );
});

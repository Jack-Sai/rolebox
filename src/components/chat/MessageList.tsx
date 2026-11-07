import { defaultRenderContent, MessageBubble } from "./MessageBubble";
import { SummaryCard } from "./SummaryCard";
import type { Message } from "../../types";

export interface MessageListProps {
  messages: Message[];
  onEdit?: (id: number, content: string) => void;
  onDelete?: (id: number) => void;
  versionsByGroup?: Record<number, Message[]>;
  onActivateVersion?: (messageId: number) => void;
  onRegenerate?: (messageId: number) => void;
}

export function MessageList({
  messages,
  onEdit,
  onDelete,
  versionsByGroup,
  onActivateVersion,
  onRegenerate,
}: MessageListProps) {
  return (
    <div className="space-y-3" data-testid="message-list">
      {messages.map((message) => {
        // 坑 #4：switch 必须有 default，否则新增 BlockKind 会静默不渲染。
        switch (message.role) {
          case "narration":
            // 旁白和普通消息一样可编辑、删除，渲染上保留斜体区分。
            return (
              <MessageBubble
                key={message.id}
                message={message}
                renderContent={defaultRenderContent}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          case "summary":
            return <SummaryCard key={message.id} content={message.content} />;
          case "user":
          case "assistant":
            // renderContent 传模块级函数，不用内联箭头（坑 #12 / #13）。
            return (
              <MessageBubble
                key={message.id}
                message={message}
                renderContent={defaultRenderContent}
                onEdit={onEdit}
                onDelete={onDelete}
                versions={versionsByGroup?.[message.version_group]}
                onActivateVersion={onActivateVersion}
                onRegenerate={onRegenerate}
              />
            );
          default:
            return (
              <div key={message.id} data-testid="unknown-block">
                未知消息类型
              </div>
            );
        }
      })}
    </div>
  );
}

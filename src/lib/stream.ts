import type { GroupMessage, Message, StreamEvent } from "../types";

export interface StreamBlock {
  kind: "text" | "note";
  content: string;
}

export interface StreamHandlerOptions {
  onStart?: (messageId: number) => void;
  onAppend: (text: string) => void;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
  }) => void;
  onDone: (message: Message) => void;
  onDoneGroup?: (message: GroupMessage) => void;
  onError: (message: string) => void;
  onCancelled?: () => void;
}

/// 只在末尾是文本块时合并。中途插入其它块会切断 Markdown 段落（dev.md 坑 #5）。
export function mergeText(blocks: StreamBlock[], text: string): StreamBlock[] {
  if (!text) return blocks;
  const last = blocks[blocks.length - 1];
  if (last?.kind === "text") {
    return [...blocks.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...blocks, { kind: "text", content: text }];
}

/// 插入非文本块前先排空缓冲；之后的 delta 会写到新块之后，不会回写旧段落。
export function flushBuffer(
  blocks: StreamBlock[],
  buffer: string,
): StreamBlock[] {
  return buffer ? mergeText(blocks, buffer) : blocks;
}

export function insertBlock(
  blocks: StreamBlock[],
  buffer: string,
  block: StreamBlock,
): { blocks: StreamBlock[]; buffer: string } {
  return {
    blocks: [...flushBuffer(blocks, buffer), block],
    buffer: "",
  };
}

/// 把 Channel<StreamEvent> 的六种事件分发到页面回调。
export function createStreamHandler(
  options: StreamHandlerOptions,
): (event: StreamEvent) => void {
  return (event: StreamEvent): void => {
    switch (event.type) {
      case "start":
        options.onStart?.(event.messageId);
        break;
      case "delta":
        options.onAppend(event.content);
        break;
      case "usage":
        options.onUsage?.({
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
        });
        break;
      case "done":
        options.onDone(event.message);
        break;
      case "done_group":
        options.onDoneGroup?.(event.message);
        break;
      case "error":
        options.onError(event.message);
        break;
      case "cancelled":
        // 已生成内容由页面保留，后端会落库。
        options.onCancelled?.();
        break;
      default: {
        // 新增事件类型时不会静默丢帧；never 让 TS 在漏 case 时编译报错。
        const unexpected: never = event;
        void unexpected;
        break;
      }
    }
  };
}

import { describe, expect, it, vi } from "vitest";
import {
  createStreamHandler,
  flushBuffer,
  insertBlock,
  mergeText,
} from "./stream";
import type { Message, StreamEvent } from "../types";

const doneMessage: Message = {
  id: 7,
  session_id: 1,
  role: "assistant",
  content: "你好",
  version_group: 7,
  is_active: true,
  deprecated: false,
  summarized: false,
  created_at: "2026-11-07 00:00:00",
};

describe("createStreamHandler", () => {
  it("把六种 StreamEvent 分发到对应回调", () => {
    const callbacks = {
      onStart: vi.fn(),
      onAppend: vi.fn(),
      onUsage: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onCancelled: vi.fn(),
    };
    const handler = createStreamHandler(callbacks);
    const events: StreamEvent[] = [
      { type: "start", messageId: 0 },
      { type: "delta", content: "你" },
      { type: "usage", promptTokens: 1, completionTokens: 2 },
      { type: "done", message: doneMessage },
      { type: "error", message: "出错" },
      { type: "cancelled" },
    ];
    events.forEach(handler);

    expect(callbacks.onStart).toHaveBeenCalledWith(0);
    expect(callbacks.onAppend).toHaveBeenCalledWith("你");
    expect(callbacks.onUsage).toHaveBeenCalledWith({
      promptTokens: 1,
      completionTokens: 2,
    });
    expect(callbacks.onDone).toHaveBeenCalledWith(doneMessage);
    expect(callbacks.onError).toHaveBeenCalledWith("出错");
    expect(callbacks.onCancelled).toHaveBeenCalledTimes(1);
  });

  it("未知事件被忽略而不抛错", () => {
    const handler = createStreamHandler({
      onAppend: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(() =>
      handler({ type: "mystery" } as unknown as StreamEvent),
    ).not.toThrow();
  });
});

describe("mergeText", () => {
  it("只在末尾是文本块时合并", () => {
    const first = mergeText([], "你");
    expect(first).toEqual([{ kind: "text", content: "你" }]);
    expect(mergeText(first, "好")).toEqual([
      { kind: "text", content: "你好" },
    ]);

    const withNote = [...first, { kind: "note" as const, content: "旁白" }];
    expect(mergeText(withNote, "后续")).toEqual([
      { kind: "text", content: "你" },
      { kind: "note", content: "旁白" },
      { kind: "text", content: "后续" },
    ]);
  });

  it("插入非文本块前排空缓冲，后续 delta 不回写旧段落", () => {
    const withBuffer = flushBuffer(
      [{ kind: "text", content: "前半" }],
      "后半",
    );
    expect(withBuffer).toEqual([{ kind: "text", content: "前半后半" }]);

    const inserted = insertBlock(withBuffer, "待排空", {
      kind: "note",
      content: "旁白",
    });
    expect(inserted.buffer).toBe("");
    expect(inserted.blocks).toEqual([
      { kind: "text", content: "前半后半待排空" },
      { kind: "note", content: "旁白" },
    ]);

    const after = mergeText(inserted.blocks, "新段落");
    expect(after[0].content).toBe("前半后半待排空");
    expect(after[2]).toEqual({ kind: "text", content: "新段落" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../../types";

const message: Message = {
  id: 1,
  session_id: 1,
  role: "assistant",
  content: "你好",
  version_group: 1,
  is_active: true,
  deprecated: false,
  summarized: false,
  created_at: "2026-11-07 00:00:00",
};

describe("MessageBubble memo", () => {
  it("props 引用不变时不重新渲染历史消息", () => {
    const renderContent = vi.fn((text: string) => text);
    const { rerender } = render(
      <MessageBubble message={message} renderContent={renderContent} />,
    );
    expect(renderContent).toHaveBeenCalledTimes(1);

    // 打字机刷新父组件但历史消息 props 不变，memo 应拦住。
    rerender(<MessageBubble message={message} renderContent={renderContent} />);
    expect(renderContent).toHaveBeenCalledTimes(1);

    // 消息真的变了才重新渲染。
    rerender(
      <MessageBubble
        message={{ ...message, content: "新内容" }}
        renderContent={renderContent}
      />,
    );
    expect(renderContent).toHaveBeenCalledTimes(2);
  });
});

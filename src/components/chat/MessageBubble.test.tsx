import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("MessageBubble 消息操作", () => {
  it("编辑后把新内容交给 onEdit", () => {
    const onEdit = vi.fn();
    render(<MessageBubble message={message} onEdit={onEdit} />);

    fireEvent.click(screen.getByLabelText("编辑"));
    const input = screen.getByLabelText("编辑消息") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "改过的内容" } });
    fireEvent.click(screen.getByText("保存"));

    expect(onEdit).toHaveBeenCalledWith(1, "改过的内容");
  });

  it("删除按钮把消息 id 交给 onDelete", () => {
    const onDelete = vi.fn();
    render(<MessageBubble message={message} onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("删除"));

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("复制按钮把内容写入剪贴板", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<MessageBubble message={message} />);

    fireEvent.click(screen.getByLabelText("复制"));

    expect(writeText).toHaveBeenCalledWith("你好");
  });
});

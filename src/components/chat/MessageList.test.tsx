import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { Message } from "../../types";

const base: Message = {
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

describe("MessageList", () => {
  it("未知消息类型走 default 兜底而不是静默消失", () => {
    // 用类型断言模拟未来新增但尚未加 case 的 role（坑 #4）。
    const unknown = {
      ...base,
      id: 9,
      role: "unknown_kind" as unknown as Message["role"],
    };
    render(<MessageList messages={[unknown]} />);

    expect(screen.getByTestId("unknown-block")).toBeTruthy();
    expect(screen.getByText("未知消息类型")).toBeTruthy();
  });

  it("已知消息类型正常渲染气泡", () => {
    render(<MessageList messages={[base]} />);
    expect(screen.getByTestId("bubble-1")).toBeTruthy();
    expect(screen.getByText("你好")).toBeTruthy();
  });

  it("旁白消息保留居中斜体样式，并可编辑、删除", () => {
    const narration = {
      ...base,
      id: 2,
      role: "narration" as const,
      content: "窗外下雨了",
    };
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<MessageList messages={[narration]} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByTestId("narration-line")).toBeTruthy();
    expect(screen.getByText(/窗外下雨了/)).toBeTruthy();
    expect(screen.queryByTestId("bubble-2")).toBeNull();
    expect(screen.getByLabelText("编辑")).toBeTruthy();
    expect(screen.getByLabelText("删除")).toBeTruthy();
  });

  it("摘要消息渲染为 SummaryCard 而不是普通气泡", () => {
    const summary = {
      ...base,
      id: 3,
      role: "summary" as const,
      content: "两人在雨夜初次相遇",
    };
    render(<MessageList messages={[summary]} />);

    expect(screen.getByTestId("summary-card")).toBeTruthy();
    expect(screen.queryByTestId("bubble-3")).toBeNull();
  });
});

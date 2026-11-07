import { describe, expect, it } from "vitest";
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
});

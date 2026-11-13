import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromptPreviewDialog } from "./PromptPreviewDialog";

// jsdom 没有 navigator.clipboard，测试里手动注入一个可断言的桩。
beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  });
});

describe("PromptPreviewDialog", () => {
  it("open 为 false 时不渲染任何内容", () => {
    render(<PromptPreviewDialog open={false} prompt="x" onClose={() => {}} />);
    expect(screen.queryByTestId("prompt-preview-dialog")).toBeNull();
  });

  it("展示传入的 prompt 文本", () => {
    render(
      <PromptPreviewDialog
        open
        prompt="【身份】你是甲，一句话。"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("【身份】你是甲，一句话。")).toBeTruthy();
  });

  it("点击复制调用 clipboard.writeText 并切换为已复制", async () => {
    render(
      <PromptPreviewDialog open prompt="PROMPT内容" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByText("复制"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("PROMPT内容");
    await waitFor(() => expect(screen.getByText("已复制")).toBeTruthy());
  });

  it("点击关闭调用 onClose", () => {
    const onClose = vi.fn();
    render(<PromptPreviewDialog open prompt="x" onClose={onClose} />);
    fireEvent.click(screen.getByText("关闭"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

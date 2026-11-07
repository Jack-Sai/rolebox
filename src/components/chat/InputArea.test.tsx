import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InputArea } from "./InputArea";

describe("InputArea", () => {
  it("发送时把内容交给回调并清空输入框", () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const input = screen.getByLabelText("消息内容") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.click(screen.getByText("发送"));

    expect(onSend).toHaveBeenCalledWith("你好");
    expect(input.value).toBe("");
  });

  it("空白内容不会触发发送", () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const input = screen.getByLabelText("消息内容") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("发送"));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("打开旁白模式后发送走 onSendNarration", () => {
    const onSend = vi.fn();
    const onSendNarration = vi.fn();
    render(<InputArea onSend={onSend} onSendNarration={onSendNarration} />);

    fireEvent.click(screen.getByText("旁白模式"));
    const input = screen.getByLabelText("消息内容") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "窗外下雨了" } });
    fireEvent.click(screen.getByText("发送"));

    expect(onSendNarration).toHaveBeenCalledWith("窗外下雨了");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("旁白开关的 aria-pressed 反映当前模式", () => {
    render(<InputArea onSend={vi.fn()} onSendNarration={vi.fn()} />);

    const toggle = screen.getByText("旁白模式");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("流式期间发送按钮变为停止并调用 onStop", () => {
    const onStop = vi.fn();
    render(<InputArea onSend={vi.fn()} onStop={onStop} streaming />);

    fireEvent.click(screen.getByText("停止"));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("发送")).toBeNull();
  });
});

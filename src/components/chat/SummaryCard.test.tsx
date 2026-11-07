import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCard } from "./SummaryCard";

describe("SummaryCard", () => {
  it("显示摘要标签与正文", () => {
    render(<SummaryCard content="两人在雨夜初次相遇" />);

    expect(screen.getByTestId("summary-card")).toBeTruthy();
    expect(screen.getByText(/雨夜初遇|两人在雨夜初次相遇/)).toBeTruthy();
    // 语义断言：要能看出这是摘要，不是普通消息（坑 #11）。
    expect(screen.getByTestId("summary-card").textContent).toMatch(/摘要/);
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemberBar } from "./MemberBar";
import type { GroupMember } from "../../types";

const first: GroupMember = {
  character_id: 1,
  sort_order: 0,
  name: "甲",
  avatar_color: "#111111",
};

const second: GroupMember = {
  character_id: 2,
  sort_order: 1,
  name: "乙",
  avatar_color: "#222222",
};

describe("MemberBar", () => {
  it("生成期间当前成员显示生成中，其他成员置灰", () => {
    render(
      <MemberBar
        members={[first, second]}
        generatingId={first.character_id}
        disabled={false}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByText("生成中…")).toBeTruthy();
    // 注意别用 /opacity/：基础类里的 transition-opacity 会让断言假绿。
    expect(screen.getByText("乙").className).toMatch(/opacity-40/);
  });

  it("disabled 时点击不触发 onGenerate", () => {
    const onGenerate = vi.fn();
    render(
      <MemberBar
        members={[first]}
        generatingId={null}
        disabled
        onGenerate={onGenerate}
      />,
    );

    fireEvent.click(screen.getByText("甲"));

    expect(onGenerate).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VersionSwitcher } from "./VersionSwitcher";
import type { Message } from "../../types";

const base: Message = {
  id: 1,
  session_id: 1,
  role: "assistant",
  content: "第一版",
  version_group: 1,
  is_active: true,
  deprecated: false,
  summarized: false,
  created_at: "2026-11-07 00:00:00",
};

const second: Message = {
  ...base,
  id: 5,
  content: "第二版",
  is_active: false,
};

describe("VersionSwitcher", () => {
  it("显示当前版本序号与总数", () => {
    render(
      <VersionSwitcher
        versions={[base, second]}
        currentId={base.id}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("version-indicator").textContent).toBe("1/2");
  });

  it("点击下一个版本把目标 id 交给 onActivate", () => {
    const onActivate = vi.fn();
    render(
      <VersionSwitcher
        versions={[base, second]}
        currentId={base.id}
        onActivate={onActivate}
      />,
    );

    fireEvent.click(screen.getByLabelText("下一个版本"));

    expect(onActivate).toHaveBeenCalledWith(second.id);
  });

  it("只有一个版本时不渲染", () => {
    const { container } = render(
      <VersionSwitcher
        versions={[base]}
        currentId={base.id}
        onActivate={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-testid="version-switcher"]')).toBeNull();
  });
});

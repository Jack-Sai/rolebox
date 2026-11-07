import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextBar } from "./ContextBar";

describe("ContextBar", () => {
  it("显示已用与上限，并按比例填充进度条", () => {
    render(<ContextBar used={512} limit={2048} isAccurate />);

    expect(screen.getByTestId("context-text").textContent).toContain("512");
    expect(screen.getByTestId("context-text").textContent).toContain("2048");

    const fill = screen.getByTestId("context-fill") as HTMLElement;
    expect(fill.style.width).toBe("25%");
  });

  it("接近上限时用危险色而不是普通色", () => {
    render(<ContextBar used={1950} limit={2048} isAccurate />);

    const className = screen.getByTestId("context-fill").className;
    expect(className).toMatch(/red/);
  });

  it("估算值会标注出来", () => {
    render(<ContextBar used={100} limit={4096} isAccurate={false} />);

    expect(screen.getByTestId("context-text").textContent).toMatch(/估算/);
  });

  it("上限为 0 时不出现 NaN", () => {
    render(<ContextBar used={10} limit={0} isAccurate={false} />);

    const fill = screen.getByTestId("context-fill") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});

import { describe, expect, it } from "vitest";
import { matchShortcut } from "./shortcuts";

describe("matchShortcut", () => {
  it("Ctrl 或 Cmd + Enter 触发发送", () => {
    expect(matchShortcut({ key: "Enter", ctrlKey: true, metaKey: false })).toBe(
      "send",
    );
    expect(matchShortcut({ key: "Enter", ctrlKey: false, metaKey: true })).toBe(
      "send",
    );
  });

  it("普通 Enter 留给换行，Esc 停止", () => {
    expect(
      matchShortcut({ key: "Enter", ctrlKey: false, metaKey: false }),
    ).toBeNull();
    expect(matchShortcut({ key: "Escape", ctrlKey: false, metaKey: false })).toBe(
      "stop",
    );
    expect(matchShortcut({ key: "a", ctrlKey: true, metaKey: false })).toBeNull();
  });
});

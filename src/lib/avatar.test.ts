import { describe, expect, it } from "vitest";
import { AVATAR_PALETTE, avatarColor } from "./avatar";

describe("avatarColor", () => {
  it("同一个名字总是得到同一个颜色，且落在调色板内", () => {
    const color = avatarColor("林黛玉");
    expect(color).toBe(avatarColor("林黛玉"));
    expect(AVATAR_PALETTE).toContain(color);
  });

  it("空名字也有确定结果", () => {
    expect(avatarColor("")).toBe(avatarColor(""));
    expect(AVATAR_PALETTE).toContain(avatarColor(""));
  });
});

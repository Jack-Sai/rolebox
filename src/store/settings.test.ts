import { describe, expect, it } from "vitest";
import { resolveTheme } from "./settings";

describe("resolveTheme", () => {
  it("system 跟随系统偏好", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("显式主题不受系统影响", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

import { describe, expect, it } from "vitest";
import { cn, truncate } from "./utils";

describe("cn", () => {
  it("过滤假值并保留有效类名", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("truncate", () => {
  it("不超出上限时原样返回", () => {
    expect(truncate("短文本", 10)).toBe("短文本");
  });

  it("超出上限时截断并加省略号", () => {
    expect(truncate("一二三四五六", 3)).toBe("一二三…");
  });
});

import { describe, expect, it } from "vitest";
import en from "./en";
import zh from "./zh";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null
      ? keys(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("i18n 字典", () => {
  it("中英字典 key 结构完全一致，不会漏译", () => {
    expect(keys(en).sort()).toEqual(keys(zh).sort());
  });
});

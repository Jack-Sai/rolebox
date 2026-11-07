import { describe, expect, it } from "vitest";
import { buildSingleSystemPrompt } from "./prompt";

const character = { name: "甲", tagline: "一句话", persona: "完整设定" };

describe("buildSingleSystemPrompt", () => {
  it("同输入输出字节一致（KV Cache 前缀稳定的前提）", () => {
    const first = buildSingleSystemPrompt(character, "", null);
    const second = buildSingleSystemPrompt(character, "", null);
    expect(first).toBe(second);
  });

  it("空场景与无分身用固定占位，不注入动态内容", () => {
    const text = buildSingleSystemPrompt(character, "", null);
    expect(text).toContain("（未指定）");
    expect(text).toContain("（用户未指定身份）");
    expect(text).toContain("【格式规则】");
  });
});

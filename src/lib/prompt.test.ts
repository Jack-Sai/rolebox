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

  // 与后端 prompt.rs 的单测共用同一份期望模板，防止两边漂移。
  it("输出与 DESIGN 5.5.1 模板逐字一致", () => {
    expect(buildSingleSystemPrompt(character, "", null)).toBe(
      [
        "【身份】你是甲，一句话。",
        "你只扮演甲，绝对不要替用户说话，不要描写用户的动作和心理。",
        "",
        "【完整设定】",
        "完整设定",
        "",
        "【场景】",
        "（未指定）",
        "",
        "【用户】",
        "（用户未指定身份）",
        "",
        "【纪律约束】",
        "- 严禁输出思考过程、推理痕迹、meta 说明或任何非角色内容，不要使用任何思考标签",
        "- 不得主动发起对话，仅在用户输入后回应",
        "- 始终保持角色人设，不得以模型或助手身份自述",
        "- 回答控制在150字以内，简洁有力，不要冗长",
        "",
        "【格式规则】",
        "- 你的所有发言直接书写，不要加 [角色名]: 前缀",
        "- 动作、神态、心理用圆括号（）描写",
        "- 不输出思考过程，不输出任何 meta 说明或旁白",
      ].join("\n"),
    );
  });
});

// 前端只读预览，与后端 prompt.rs 的 build_single_system_prompt 必须逐字一致（DESIGN 6.4）。
// 这里只用于角色编辑页展示，绝不参与实际请求；改模板时两边要同步。
export interface PromptCharacter {
  name: string;
  tagline: string;
  persona: string;
}

export function buildSingleSystemPrompt(
  character: PromptCharacter,
  scenario: string,
  userPersona: { persona: string } | null,
): string {
  const scenarioText = scenario.trim() ? scenario : "（未指定）";
  const personaText = userPersona?.persona?.trim()
    ? userPersona.persona
    : "（用户未指定身份）";

  return [
    `【身份】你是${character.name}，${character.tagline}。`,
    `你只扮演${character.name}，绝对不要替用户说话，不要描写用户的动作和心理。`,
    "",
    "【完整设定】",
    character.persona,
    "",
    "【场景】",
    scenarioText,
    "",
    "【用户】",
    personaText,
    "",
    "【纪律约束】",
    "- 严禁输出思考过程、推理痕迹、meta 说明或任何非角色内容，不要使用任何思考标签",
    "- 不得主动发起对话，仅在用户输入后回应",
    "- 始终保持角色人设，不得以模型或助手身份自述",
    "- 回复简洁，控制在适当长度，避免冗长",
    "",
    "【格式规则】",
    "- 你的所有发言直接书写，不要加 [角色名]: 前缀",
    "- 动作、神态、心理用圆括号（）描写",
    "- 不输出思考过程，不输出任何 meta 说明或旁白",
  ].join("\n");
}

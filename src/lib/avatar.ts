// 姓名 → 稳定颜色。角色自带 avatar_color 时用自带值，这里是新建角色的默认值来源。
export const AVATAR_PALETTE = [
  "#e57373",
  "#f06292",
  "#ba68c8",
  "#9575cd",
  "#7986cb",
  "#64b5f6",
  "#4fc3f7",
  "#4db6ac",
  "#81c784",
  "#ffb74d",
] as const;

export function avatarColor(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

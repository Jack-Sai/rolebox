export type ShortcutAction = "send" | "stop" | null;

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/// 应用内快捷键：Ctrl/Cmd+Enter 发送，Esc 停止生成。抽成纯函数便于单测。
/// 普通 Enter 必须留给换行，所以 send 一定要求修饰键。
export function matchShortcut(event: ShortcutEvent): ShortcutAction {
  const withModifier = event.ctrlKey || event.metaKey;
  if (withModifier && event.key === "Enter") return "send";
  if (event.key === "Escape") return "stop";
  return null;
}

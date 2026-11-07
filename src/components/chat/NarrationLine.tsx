/// 旁白不是任何一方说的话，用居中斜体行表示，和左右气泡区分开。
/// 构造上下文时它会被转成 user + 【旁白】前缀（format_single_history）。
export function NarrationLine({ content }: { content: string }) {
  return (
    <div className="flex justify-center" data-testid="narration-line">
      <p className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-[var(--surface-muted)] px-4 py-2 text-center text-xs italic text-[var(--text-muted)]">
        <span className="mr-1 text-[var(--icon-muted)] not-italic">旁白</span>
        {content}
      </p>
    </div>
  );
}

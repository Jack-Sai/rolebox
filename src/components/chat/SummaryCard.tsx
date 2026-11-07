/// 摘要卡片：不是任何一方说的话，用块状卡片和对话气泡区分开。
/// 构造上下文时会被 `format_single_history` 移到 system 之后（DESIGN 10.2）。
export function SummaryCard({ content }: { content: string }) {
  return (
    <div className="flex justify-center" data-testid="summary-card">
      <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="mb-1 font-medium text-amber-700">对话摘要</p>
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

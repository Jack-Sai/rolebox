import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { Button } from "./button";

export interface PromptPreviewDialogProps {
  open: boolean;
  prompt: string;
  onClose: () => void;
}

// 开发者模式用：只读展示当前会话实际会发给模型的 system prompt，并提供复制按钮。
export function PromptPreviewDialog({
  open,
  prompt,
  onClose,
}: PromptPreviewDialogProps) {
  const t = useI18n();
  const [copied, setCopied] = useState(false);

  // 每次打开都重置「已复制」状态，避免下次打开还显示旧的文案。
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // 复制失败时静默：用户仍可手动选择文本复制。
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="prompt-preview-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t.settings.developer.previewTitle}
    >
      <div className="flex max-h-[80vh] w-[640px] max-w-[90vw] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <h2 className="text-base font-medium">
          {t.settings.developer.previewTitle}
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t.settings.developer.previewHint}
        </p>
        <pre className="mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-muted)] p-3 text-xs leading-relaxed">
          {prompt}
        </pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.settings.developer.close}
          </Button>
          <Button variant="primary" onClick={copy}>
            {copied ? t.settings.developer.copied : t.settings.developer.copy}
          </Button>
        </div>
      </div>
    </div>
  );
}

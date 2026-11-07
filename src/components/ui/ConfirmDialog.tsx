import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/// 应用内确认弹窗。不用 window.confirm：原生对话框在 WebView 里的时序不可控，
/// 且「打开弹窗」这一步绝不能附带任何写操作。
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        data-testid="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="w-96 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
          <h2 className="text-base font-medium text-[var(--text)]">{title}</h2>
          {description && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
          )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

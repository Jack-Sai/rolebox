import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    win.isMaximized().then(setMaximized);

    let unMax: (() => void) | null = null;
    let unMin: (() => void) | null = null;
    let unRes: (() => void) | null = null;

    (async () => {
      const a = await win.listen("tauri://webview-window-maximized", () =>
        setMaximized(true),
      );
      const b = await win.listen("tauri://webview-window-minimized", () =>
        setMaximized(false),
      );
      const c = await win.listen("tauri://webview-window-restored", () =>
        setMaximized(false),
      );
      unMax = () => void a();
      unMin = () => void b();
      unRes = () => void c();
    })();

    return () => {
      unMax?.();
      unMin?.();
      unRes?.();
    };
  }, []);

  const handleMinimize = useCallback(() => void win.minimize(), [win]);
  const handleToggleMaximize = useCallback(() => {
    maximized ? void win.unmaximize() : void win.maximize();
  }, [win, maximized]);
  const handleClose = useCallback(() => void win.close(), [win]);

  return (
    <header
      data-tauri-drag-region
      className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <span className="font-medium text-[var(--text)]">RoleBox</span>
        <span className="text-xs text-[var(--text-muted)]">v0.1.0</span>
      </div>
      <div data-tauri-drag-region="false" className="flex items-center gap-1">
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleMinimize}
          aria-label="最小化"
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
        >
          <Minimize2 size={16} />
        </button>
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleToggleMaximize}
          aria-label={maximized ? "还原" : "最大化"}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
        >
          {maximized ? <Square size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleClose}
          aria-label="关闭"
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--destructive-bg)] hover:text-[var(--destructive)]"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

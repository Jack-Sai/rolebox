import { useEffect } from "react";
import { useToastStore } from "../store/toast";

export function Toaster() {
  const message = useToastStore((state) => state.message);
  const clear = useToastStore((state) => state.clear);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clear, 3000);
    return () => window.clearTimeout(timer);
  }, [message, clear]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] shadow-lg"
    >
      {message}
    </div>
  );
}

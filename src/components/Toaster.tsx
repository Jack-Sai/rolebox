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
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}

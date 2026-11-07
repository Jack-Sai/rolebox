import { create } from "zustand";

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

// 全局提示。组件测试不 mock store，只 mock Tauri 底层模块（dev.md:310）。
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));

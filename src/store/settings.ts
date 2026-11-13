import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type Language = "zh" | "en";

/// 抽成纯函数：测试里不依赖 jsdom 的 matchMedia 也能验证 light/dark 两路。
export function resolveTheme(
  theme: Theme,
  prefersDark: boolean,
): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(theme, prefersDark);
}

interface SettingsState {
  theme: Theme;
  language: Language;
  maxOutputTokens: number;
  developerMode: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setMaxOutputTokens: (n: number) => void;
  setDeveloperMode: (enabled: boolean) => void;
}

// 外观与开发者开关都只存 localStorage（DESIGN 12），不入库。
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "zh",
      maxOutputTokens: 0,
      developerMode: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setLanguage: (language) => set({ language }),
      setMaxOutputTokens: (maxOutputTokens) => set({ maxOutputTokens }),
      setDeveloperMode: (developerMode) => set({ developerMode }),
    }),
    {
      name: "rolebox-settings",
      // 重新水合后立刻应用主题，避免启动时闪一下亮色。
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

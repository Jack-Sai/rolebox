import { useSettingsStore, type Language } from "../store/settings";
import en from "./en";
import zh from "./zh";

// 手写 i18n，不引第三方库（DESIGN 6.6）。en 的类型来自 zh，漏 key 会编译报错。
export const dictionaries: Record<Language, typeof zh> = { zh, en };

export type Dictionary = typeof zh;

export function useI18n(): Dictionary {
  const language = useSettingsStore((state) => state.language);
  return dictionaries[language] ?? zh;
}

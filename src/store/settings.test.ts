import { beforeEach, describe, expect, it } from "vitest";
import { resolveTheme, useSettingsStore } from "./settings";

describe("resolveTheme", () => {
  it("system 跟随系统偏好", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("显式主题不受系统影响", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("developerMode", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ developerMode: false });
  });

  it("默认关闭", () => {
    expect(useSettingsStore.getState().developerMode).toBe(false);
  });

  it("setDeveloperMode 切换并持久化到 localStorage", () => {
    useSettingsStore.getState().setDeveloperMode(true);
    expect(useSettingsStore.getState().developerMode).toBe(true);
    // persist 中间件把状态写入 rolebox-settings，包含 developerMode:true。
    expect(localStorage.getItem("rolebox-settings")).toContain(
      '"developerMode":true',
    );
  });
});

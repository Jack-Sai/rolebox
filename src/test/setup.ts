import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// 组件测试只 mock Tauri 底层模块，store 保持真实（dev.md:310）。
// 不在这里 mock 业务 api.ts，否则等于把被测逻辑也 mock 掉了。
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// vitest 未开 globals，RTL 不会自动注册 cleanup；不清理会让多个测试的 DOM 叠加，
// 出现「找到多个元素」这类莫名其妙的失败（dev.md 坑 #9 同源）。
afterEach(() => {
  cleanup();
  localStorage.clear();
});

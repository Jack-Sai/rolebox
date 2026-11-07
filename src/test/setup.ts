import { vi } from "vitest";

// 组件测试只 mock Tauri 底层模块，store 保持真实（dev.md:310）。
// 不在这里 mock 业务 api.ts，否则等于把被测逻辑也 mock 掉了。
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

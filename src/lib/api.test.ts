import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { api } from "./api";

// 只 mock Tauri 底层模块，store 保持真实（dev.md:310）。
const mockedInvoke = vi.mocked(invoke) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInvoke.mockResolvedValue(null);
});

describe("角色导入导出命令", () => {
  it("export_character 传 id 与 path", async () => {
    await api.exportCharacter(3, "C:/角色.json");
    expect(mockedInvoke).toHaveBeenCalledWith("export_character", {
      id: 3,
      path: "C:/角色.json",
    });
  });

  it("import_character 传 path 与 mode", async () => {
    await api.importCharacter("C:/角色.json", "new");
    expect(mockedInvoke).toHaveBeenCalledWith("import_character", {
      path: "C:/角色.json",
      mode: "new",
    });
  });
});

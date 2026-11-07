import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";

// setup.ts 只 mock Tauri 底层模块，不 mock store（dev.md:310）。
const mockedInvoke = vi.mocked(invoke) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedInvoke.mockReset();
  // 同一测试文件内 jsdom 的 localStorage 是共享的（坑 #9）。
  localStorage.clear();
});

describe("SettingsPage 我的分身", () => {
  it("从后端加载并展示分身", async () => {
    mockedInvoke.mockResolvedValue([
      { id: 1, name: "甲", persona: "身份设定" },
    ]);

    render(<SettingsPage />);

    expect(await screen.findByText("甲")).toBeTruthy();
    expect(mockedInvoke).toHaveBeenCalledWith("get_personas");
  });

  it("填写表单后调用 create_persona", async () => {
    mockedInvoke.mockImplementation(async (command: string) => {
      if (command === "get_personas") return [];
      return null;
    });

    render(<SettingsPage />);
    await screen.findByText("还没有分身");

    fireEvent.click(screen.getByText("新建分身"));
    fireEvent.change(screen.getByLabelText("分身名"), {
      target: { value: "新分身" },
    });
    fireEvent.change(screen.getByLabelText("分身设定"), {
      target: { value: "新身份" },
    });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("create_persona", {
        input: { name: "新分身", persona: "新身份" },
      });
    });
  });
});

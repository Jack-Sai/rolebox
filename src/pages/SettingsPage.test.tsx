import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { SettingsPage } from "./SettingsPage";
import { useSettingsStore } from "../store/settings";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

const mockedSave = vi.mocked(save) as unknown as ReturnType<typeof vi.fn>;

// setup.ts 只 mock Tauri 底层模块，不 mock store（dev.md:310）。
const mockedInvoke = vi.mocked(invoke) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedInvoke.mockReset();
  // 同一测试文件内 jsdom 的 localStorage 是共享的（坑 #9）。
  localStorage.clear();
  useSettingsStore.setState({ developerMode: false });
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

describe("SettingsPage llama-server 页签", () => {
  it("加载当前地址，修改后能保存", async () => {
    mockedInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_personas":
          return [];
        case "get_settings":
          return { server_url: "http://127.0.0.1:8080" };
        default:
          return null;
      }
    });

    render(<SettingsPage />);

    fireEvent.click(screen.getByText("llama-server"));
    const input = (await screen.findByLabelText(
      "服务器地址",
    )) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("http://127.0.0.1:8080"));

    fireEvent.change(input, { target: { value: "http://localhost:9090/" } });
    fireEvent.click(screen.getByText("保存地址"));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("set_server_url", {
        url: "http://localhost:9090/",
      });
    });
  });
});

describe("SettingsPage 数据页签", () => {
  it("选好路径后调用 export_backup", async () => {
    mockedInvoke.mockImplementation(async (command: string) => {
      if (command === "get_personas") return [];
      return null;
    });
    mockedSave.mockResolvedValue("/tmp/rolebox-backup.zip");

    render(<SettingsPage />);
    fireEvent.click(screen.getByText("数据"));
    fireEvent.click(await screen.findByText("导出备份"));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("export_backup", {
        path: "/tmp/rolebox-backup.zip",
      });
    });
  });
});

describe("SettingsPage 开发者页签", () => {
  it("开启开发者模式后写入 store", async () => {
    mockedInvoke.mockImplementation(async (command: string) => {
      if (command === "get_personas") return [];
      return null;
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByText("开发者"));

    expect(
      await screen.findByRole("heading", { name: "开发者模式" }),
    ).toBeTruthy();
    expect(useSettingsStore.getState().developerMode).toBe(false);

    fireEvent.click(screen.getByRole("switch"));
    expect(useSettingsStore.getState().developerMode).toBe(true);
  });
});

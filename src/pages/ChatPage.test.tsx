import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { ChatPage } from "./ChatPage";
import { useSettingsStore } from "../store/settings";

const mockedInvoke = vi.mocked(invoke) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ developerMode: true });
  mockedInvoke.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/sessions/1"]}>
      <Routes>
        <Route path="/sessions/:id" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChatPage 开发者模式预览", () => {
  it("开发者模式开启时显示按钮，点击后拉取并弹出 system prompt", async () => {
    mockedInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_session":
          return {
            id: 1,
            character_id: 1,
            title: "会话",
            scenario: "雨夜",
            user_persona_id: null,
            created_at: "",
            updated_at: "",
          };
        case "get_messages":
          return [];
        case "get_characters":
          return [
            {
              id: 1,
              name: "甲",
              tagline: "一句话",
              persona: "设定",
              avatar_color: "#ffffff",
              created_at: "",
            },
          ];
        case "get_session_system_prompt":
          return "【身份】你是甲，一句话。";
        default:
          return null;
      }
    });

    renderPage();

    const btn = await screen.findByText("查看 System Prompt");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("get_session_system_prompt", {
        sessionId: 1,
      });
    });
    expect(
      await screen.findByText("【身份】你是甲，一句话。"),
    ).toBeTruthy();
  });

  it("开发者模式关闭时不显示查看按钮", async () => {
    useSettingsStore.setState({ developerMode: false });
    mockedInvoke.mockImplementation(async (command: string) => {
      if (command === "get_session")
        return {
          id: 1,
          character_id: 1,
          title: "会话",
          scenario: "",
          user_persona_id: null,
          created_at: "",
          updated_at: "",
        };
      if (command === "get_messages") return [];
      if (command === "get_characters") return [];
      return null;
    });

    renderPage();
    await screen.findByText("会话");
    expect(screen.queryByText("查看 System Prompt")).toBeNull();
  });
});

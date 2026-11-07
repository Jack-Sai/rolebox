import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useSettingsStore } from "../store/settings";

beforeEach(() => {
  localStorage.clear();
  act(() => useSettingsStore.getState().setLanguage("zh"));
});

describe("Sidebar 多语言", () => {
  it("切换语言后导航文案跟随", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText("角色")).toBeTruthy();

    act(() => useSettingsStore.getState().setLanguage("en"));

    expect(screen.getByText("Characters")).toBeTruthy();
    expect(screen.queryByText("角色")).toBeNull();
  });
});

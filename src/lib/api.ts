import { invoke } from "@tauri-apps/api/core";
import type {
  Character,
  CharacterInput,
  UserPersona,
  UserPersonaInput,
} from "../types";

// 只有这一层直接碰 Tauri；组件测试只 mock @tauri-apps/api/core（dev.md:310）。
// input 对象内部字段用 snake_case：Tauri 只对顶层参数名做 camelCase 映射。
export const api = {
  getCharacters: () => invoke<Character[]>("get_characters"),

  createCharacter: (input: CharacterInput) =>
    invoke<Character>("create_character", { input }),

  updateCharacter: (id: number, input: CharacterInput) =>
    invoke<void>("update_character", { id, input }),

  deleteCharacter: (id: number) => invoke<void>("delete_character", { id }),

  getPersonas: () => invoke<UserPersona[]>("get_personas"),

  createPersona: (input: UserPersonaInput) =>
    invoke<UserPersona>("create_persona", { input }),

  updatePersona: (id: number, input: UserPersonaInput) =>
    invoke<void>("update_persona", { id, input }),

  deletePersona: (id: number) => invoke<void>("delete_persona", { id }),
};

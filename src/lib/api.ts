import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Character,
  CharacterInput,
  Message,
  Session,
  SessionInput,
  StreamEvent,
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

  exportCharacter: (id: number, path: string) =>
    invoke<void>("export_character", { id, path }),

  importCharacter: (path: string, mode: string) =>
    invoke<Character>("import_character", { path, mode }),

  getPersonas: () => invoke<UserPersona[]>("get_personas"),

  createPersona: (input: UserPersonaInput) =>
    invoke<UserPersona>("create_persona", { input }),

  updatePersona: (id: number, input: UserPersonaInput) =>
    invoke<void>("update_persona", { id, input }),

  deletePersona: (id: number) => invoke<void>("delete_persona", { id }),

  getSessions: (characterId: number) =>
    invoke<Session[]>("get_sessions", { characterId }),

  getSession: (id: number) => invoke<Session>("get_session", { id }),

  createSession: (input: SessionInput) =>
    invoke<Session>("create_session", { input }),

  deleteSession: (id: number) => invoke<void>("delete_session", { id }),

  getMessages: (sessionId: number) =>
    invoke<Message[]>("get_messages", { sessionId }),

  sendUserMessage: (sessionId: number, content: string) =>
    invoke<Message>("send_user_message", { sessionId, content }),

  cancelGeneration: (sessionId: number) =>
    invoke<void>("cancel_generation", { sessionId }),

  updateMessage: (id: number, content: string) =>
    invoke<void>("update_message", { id, content }),

  deleteMessage: (id: number) => invoke<void>("delete_message", { id }),

  getMessageVersions: (messageId: number) =>
    invoke<Message[]>("get_message_versions", { messageId }),

  activateMessageVersion: (messageId: number) =>
    invoke<void>("activate_message_version", { messageId }),

  regenerateMessage: async (
    messageId: number,
    onChunk: (event: StreamEvent) => void,
  ): Promise<Message> => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onChunk;
    return invoke<Message>("regenerate_message", { messageId, onChunk: channel });
  },

  generateReply: async (
    sessionId: number,
    onChunk: (event: StreamEvent) => void,
  ): Promise<Message> => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onChunk;
    return invoke<Message>("generate_reply", { sessionId, onChunk: channel });
  },
};

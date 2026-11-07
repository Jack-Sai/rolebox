import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  Character,
  CharacterInput,
  ConnectionInfo,
  ContextInfo,
  GroupMember,
  GroupMessage,
  GroupSession,
  GroupSessionInput,
  ImportStats,
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

  sendNarration: (sessionId: number, content: string) =>
    invoke<Message>("send_narration", { sessionId, content }),

  cancelGeneration: (sessionId: number) =>
    invoke<void>("cancel_generation", { sessionId }),

  updateMessage: (id: number, content: string) =>
    invoke<void>("update_message", { id, content }),

  deleteMessage: (id: number) => invoke<void>("delete_message", { id }),

  compressContext: (sessionId: number) =>
    invoke<void>("compress_context", { sessionId }),

  getContextInfo: (sessionId: number) =>
    invoke<ContextInfo>("get_context_info", { sessionId }),

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

  getSettings: () => invoke<AppConfig>("get_settings"),

  setServerUrl: (url: string) => invoke<void>("set_server_url", { url }),

  testConnection: () => invoke<ConnectionInfo>("test_connection"),

  exportBackup: (path: string) => invoke<void>("export_backup", { path }),

  importBackup: (path: string) => invoke<ImportStats>("import_backup", { path }),

  exportSessionText: (sessionId: number, format: string, path: string) =>
    invoke<void>("export_session_text", { sessionId, format, path }),

  getGroupSessions: () => invoke<GroupSession[]>("get_group_sessions"),

  createGroupSession: (input: GroupSessionInput) =>
    invoke<GroupSession>("create_group_session", { input }),

  deleteGroupSession: (id: number) =>
    invoke<void>("delete_group_session", { id }),

  getGroupMembers: (groupId: number) =>
    invoke<GroupMember[]>("get_group_members", { groupId }),

  getGroupMessages: (groupId: number) =>
    invoke<GroupMessage[]>("get_group_messages", { groupId }),

  sendGroupUserMessage: (groupId: number, content: string) =>
    invoke<GroupMessage>("send_group_user_message", { groupId, content }),

  sendGroupNarration: (groupId: number, content: string) =>
    invoke<GroupMessage>("send_group_narration", { groupId, content }),

  cancelGroupGeneration: (groupId: number) =>
    invoke<void>("cancel_group_generation", { groupId }),

  generateGroupReply: async (
    groupId: number,
    characterId: number,
    onChunk: (event: StreamEvent) => void,
  ): Promise<GroupMessage> => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onChunk;
    return invoke<GroupMessage>("generate_group_reply", {
      groupId,
      characterId,
      onChunk: channel,
    });
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

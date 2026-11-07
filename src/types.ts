// 与 src-tauri/src/models.rs 一一对应。Tauri 命令返回值由 serde 直接序列化，
// 不会自动转 camelCase，因此主数据模型保持 snake_case 字段名。

export interface Character {
  id: number;
  name: string;
  tagline: string;
  persona: string;
  avatar_color: string;
  created_at: string;
}

export interface CharacterInput {
  name: string;
  tagline: string;
  persona: string;
  avatar_color: string;
}

export interface UserPersona {
  id: number;
  name: string;
  persona: string;
}

export interface UserPersonaInput {
  name: string;
  persona: string;
}

export interface Session {
  id: number;
  character_id: number;
  title: string;
  scenario: string;
  user_persona_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SessionInput {
  character_id: number;
  title: string;
  scenario: string;
  user_persona_id: number | null;
}

export interface Message {
  id: number;
  session_id: number;
  role: "user" | "assistant" | "narration" | "summary";
  content: string;
  version_group: number;
  is_active: boolean;
  deprecated: boolean;
  summarized: boolean;
  created_at: string;
}

export interface GroupSession {
  id: number;
  title: string;
  scenario: string;
  user_persona_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface GroupSessionInput {
  title: string;
  scenario: string;
  user_persona_id: number | null;
  character_ids: number[];
}

export interface GroupMember {
  character_id: number;
  sort_order: number;
  name: string;
  avatar_color: string;
}

export interface GroupMessage {
  id: number;
  group_id: number;
  character_id: number | null;
  role: "user" | "assistant" | "narration" | "summary";
  content: string;
  version_group: number;
  is_active: boolean;
  deprecated: boolean;
  summarized: boolean;
  created_at: string;
}

// Channel<StreamEvent> 的载荷：事件名 snake_case，字段 camelCase（DESIGN 6.1 / 8.1）。
export type StreamEvent =
  | { type: "start"; messageId: number }
  | { type: "delta"; content: string }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; message: Message }
  // 群聊的收尾事件：消息带 character_id，无法复用单人的 done 字段。
  | { type: "done_group"; message: GroupMessage }
  | { type: "error"; message: string }
  | { type: "cancelled" };

export interface ImportStats {
  characters: number;
  userPersonas: number;
  sessions: number;
  messages: number;
  groupSessions: number;
}

export interface AppConfig {
  server_url: string;
}

export interface ConnectionInfo {
  ok: boolean;
  model: string;
  ctxLength: number;
}

export interface ContextInfo {
  used: number;
  limit: number;
  isAccurate: boolean;
}

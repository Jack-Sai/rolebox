import type zh from "./zh";

const en: typeof zh = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    create: "New",
    loading: "Loading…",
    on: "On",
    off: "Off",
  },
  nav: {
    characters: "Characters",
    sessions: "Solo Chat",
    groups: "Group Chat",
    settings: "Settings",
  },
  settings: {
    title: "Settings",
    tabs: {
      personas: "My Personas",
      server: "llama-server",
      appearance: "Appearance",
      data: "Data",
      developer: "Developer",
    },
    developer: {
      title: "Developer Mode",
      hint: "When enabled, a “View System Prompt” button appears in solo and group chats so you can preview and copy the prompt actually sent to the model.",
      previewTitle: "System Prompt",
      previewHint: "This is the system prompt actually sent to the model for this session; it never changes after creation.",
      copy: "Copy",
      copied: "Copied",
      close: "Close",
    },
    appearance: {
      theme: "Theme",
      system: "System",
      light: "Light",
      dark: "Dark",
      language: "Language",
      hint: "Theme and language are stored locally (localStorage), not in the database.",
    },
    server: {
      title: "llama-server",
      hint: "Sampling parameters come from the server launch flags; only the address is configured here.",
      address: "Server address",
      save: "Save address",
      test: "Test connection",
      testing: "Testing…",
    },
  },
};

export default en;

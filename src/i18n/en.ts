import type zh from "./zh";

const en: typeof zh = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    create: "New",
    loading: "Loading…",
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

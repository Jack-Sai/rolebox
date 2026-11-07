import { useCallback, useEffect, useState, type FormEvent } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useI18n } from "../i18n";
import {
  useSettingsStore,
  type Language,
  type Theme,
} from "../store/settings";
import { useToastStore } from "../store/toast";
import type { UserPersona, UserPersonaInput } from "../types";

type TabKey = "personas" | "server" | "appearance" | "data";

// 文案在 i18n 字典的 settings.tabs 里，key 与 TabKey 对齐。
const TAB_KEYS: TabKey[] = ["personas", "server", "appearance", "data"];

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

function emptyForm(): UserPersonaInput {
  return { name: "", persona: "" };
}

function PersonasPanel() {
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserPersonaInput>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const show = useToastStore((state) => state.show);
  // 分身删除走应用内二次确认，取消不删除。
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setPersonas(await api.getPersonas());
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (persona: UserPersona) => {
    setEditingId(persona.id);
    setForm({ name: persona.name, persona: persona.persona });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      show("请填写分身名");
      return;
    }
    try {
      if (editingId === null) {
        await api.createPersona(form);
      } else {
        await api.updatePersona(editingId, form);
      }
      setFormOpen(false);
      await load();
      show("已保存");
    } catch (cause) {
      show(`保存失败：${String(cause)}`);
    }
  };

  const handleDelete = (persona: UserPersona) => {
    setPendingDeleteId(persona.id);
  };

  const confirmDeletePersona = async () => {
    const id = pendingDeleteId;
    if (id === null) return;
    const persona = personas.find((p) => p.id === id);
    setPendingDeleteId(null);
    try {
      await api.deletePersona(id);
      await load();
      show(persona ? `分身「${persona.name}」已删除` : "分身已删除");
    } catch (cause) {
      show(`删除失败：${String(cause)}`);
    }
  };

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">我的分身</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            切换分身会让已有会话的上下文缓存失效。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          新建分身
        </Button>
      </header>

      {loading && <p className="text-sm text-[var(--text-muted)]">加载中…</p>}
      {error && <p className="text-sm text-[var(--destructive)]">加载失败：{error}</p>}
      {!loading && !error && personas.length === 0 && !formOpen && (
        <p           className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
          还没有分身
        </p>
      )}

      <ul className="space-y-2">
        {personas.map((persona) => (
            <li
              key={persona.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
            <div className="min-w-0">
              <p className="text-sm font-medium">{persona.name}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                {persona.persona}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => openEdit(persona)}>
                <Pencil size={14} />
                编辑
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDelete(persona)}
              >
                <Trash2 size={14} />
                删除
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {formOpen && (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">分身名</span>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">分身设定</span>
            <Textarea
              rows={4}
              value={form.persona}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, persona: event.target.value }))
              }
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit">保存</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormOpen(false)}
            >
              取消
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除这个分身？"
        description="确定后无法恢复。"
        confirmLabel="删除"
        danger
        onConfirm={confirmDeletePersona}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

function ServerPanel() {
  const show = useToastStore((state) => state.show);
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [maxOutputTokens, setMaxOutputTokens] = useState(300);
  const saveMax = useSettingsStore((state) => state.setMaxOutputTokens);

  useEffect(() => {
    void api
      .getSettings()
      .then((config) => {
        setUrl(config.server_url);
        setMaxOutputTokens(config.max_output_tokens);
      })
      .catch(() => setUrl(""));
  }, []);

  const save = async () => {
    try {
      await api.setServerUrl(url);
      show("地址已保存");
    } catch (cause) {
      show(`保存失败：${String(cause)}`);
    }
  };

  const saveMaxTokens = async () => {
    try {
      await api.setMaxOutputTokens(maxOutputTokens);
      saveMax(maxOutputTokens);
      show("最大输出长度已保存");
    } catch (cause) {
      show(`保存失败：${String(cause)}`);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const info = await api.testConnection();
      setResult(
        `连接成功：${info.model}${info.ctxLength > 0 ? `（上下文 ${info.ctxLength}）` : ""}`,
      );
    } catch (cause) {
      setResult(`连接失败：${String(cause)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-medium">llama-server</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          采样参数由 server 启动参数决定，这里只配置地址。
        </p>
      </header>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">服务器地址</span>
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="http://127.0.0.1:8080"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">最大输出长度（字数，0=不限制）</span>
        <Input
          type="number"
          min={0}
          value={maxOutputTokens}
          onChange={(event) =>
            setMaxOutputTokens(Number.parseInt(event.target.value, 10) || 0)
          }
          placeholder="300"
        />
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          默认 300 个 token（约 150 中文字）。设为 0 不限制。
        </p>
      </label>
      <div className="flex gap-2">
        <Button onClick={() => void save()}>保存地址</Button>
        <Button onClick={() => void saveMaxTokens()}>保存输出长度</Button>
        <Button variant="ghost" onClick={() => void test()} disabled={testing}>
          <CheckCircle2 size={16} />
          {testing ? "测试中…" : "测试连接"}
        </Button>
      </div>
      {result && <p className="text-sm text-[var(--text-muted)]">{result}</p>}
    </div>
  );
}

function AppearancePanel() {
  const t = useI18n();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  const themeLabel: Record<Theme, string> = {
    system: t.settings.appearance.system,
    light: t.settings.appearance.light,
    dark: t.settings.appearance.dark,
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-medium">{t.settings.tabs.appearance}</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {t.settings.appearance.hint}
        </p>
      </header>

      <div className="space-y-2">
        <span className="block text-sm font-medium">
          {t.settings.appearance.theme}
        </span>
        <div className="flex gap-2">
          {THEMES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={theme === item.value}
              onClick={() => setTheme(item.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                theme === item.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  :                 "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {themeLabel[item.value]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">
          {t.settings.appearance.language}
        </span>
        <div className="flex gap-2">
          {(["zh", "en"] as Language[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={language === value}
              onClick={() => setLanguage(value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                language === value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  :                 "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {value === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataPanel() {
  const show = useToastStore((state) => state.show);
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    const target = await save({
      defaultPath: "rolebox-backup.zip",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!target) return;
    setBusy(true);
    try {
      await api.exportBackup(target);
      show("备份已导出");
    } catch (cause) {
      show(`导出失败：${String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (typeof selected !== "string") return;
    if (
      !window.confirm(
        "导入会覆盖当前全部数据（会先自动备份一份 .before.zip）。继续？",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const stats = await api.importBackup(selected);
      show(
        `已导入：角色 ${stats.characters}、会话 ${stats.sessions}、消息 ${stats.messages}`,
      );
    } catch (cause) {
      show(`导入失败：${String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-medium">数据</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          备份包含角色、分身、会话、消息、群聊与设置；导入是覆盖式的。
        </p>
      </header>
      <div className="flex gap-2">
        <Button onClick={() => void exportBackup()} disabled={busy}>
          导出备份
        </Button>
        <Button variant="ghost" onClick={() => void importBackup()} disabled={busy}>
          导入备份
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("personas");
  const t = useI18n();

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">{t.settings.title}</h1>
      <div className="flex gap-6">
        <nav className="flex w-40 shrink-0 flex-col gap-1">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm",
                tab === key
                  ? "bg-[var(--accent)]/10 font-medium text-[var(--accent)]"
                  :                 "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {t.settings.tabs[key]}
            </button>
          ))}
        </nav>

        <section className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {tab === "personas" && <PersonasPanel />}
          {tab === "server" && <ServerPanel />}
          {tab === "appearance" && <AppearancePanel />}
          {tab === "data" && <DataPanel />}
        </section>
      </div>
    </div>
  );
}

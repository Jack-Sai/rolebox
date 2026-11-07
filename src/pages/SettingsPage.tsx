import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useSettingsStore, type Theme } from "../store/settings";
import { useToastStore } from "../store/toast";
import type { UserPersona, UserPersonaInput } from "../types";

type TabKey = "personas" | "server" | "appearance" | "data";

const TABS: { key: TabKey; label: string }[] = [
  { key: "personas", label: "我的分身" },
  { key: "server", label: "llama-server" },
  { key: "appearance", label: "外观" },
  { key: "data", label: "数据" },
];

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

  const handleDelete = async (persona: UserPersona) => {
    if (!window.confirm(`确定删除分身「${persona.name}」？`)) return;
    try {
      await api.deletePersona(persona.id);
      await load();
      show("分身已删除");
    } catch (cause) {
      show(`删除失败：${String(cause)}`);
    }
  };

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">我的分身</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            切换分身会让已有会话的上下文缓存失效。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          新建分身
        </Button>
      </header>

      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-600">加载失败：{error}</p>}
      {!loading && !error && personas.length === 0 && !formOpen && (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          还没有分身
        </p>
      )}

      <ul className="space-y-2">
        {personas.map((persona) => (
          <li
            key={persona.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{persona.name}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">
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
          className="mt-4 space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4"
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
    </>
  );
}

function ServerPanel() {
  const show = useToastStore((state) => state.show);
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getSettings()
      .then((config) => setUrl(config.server_url))
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
        <p className="mt-0.5 text-xs text-gray-500">
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
      <div className="flex gap-2">
        <Button onClick={() => void save()}>保存地址</Button>
        <Button variant="ghost" onClick={() => void test()} disabled={testing}>
          <CheckCircle2 size={16} />
          {testing ? "测试中…" : "测试连接"}
        </Button>
      </div>
      {result && <p className="text-sm text-gray-600">{result}</p>}
    </div>
  );
}

function AppearancePanel() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-medium">外观</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          主题只保存在本机（localStorage），不入库。
        </p>
      </header>
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
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DataPanel() {
  return (
    <div className="space-y-2">
      <h2 className="font-medium">数据</h2>
      <p className="text-xs text-gray-500">
        整体备份与会话文本导出在下一批接入（C45）。
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("personas");

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">设置</h1>
      <div className="flex gap-6">
        <nav className="flex w-40 shrink-0 flex-col gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-current={tab === item.key ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm",
                tab === item.key
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-5">
          {tab === "personas" && <PersonasPanel />}
          {tab === "server" && <ServerPanel />}
          {tab === "appearance" && <AppearancePanel />}
          {tab === "data" && <DataPanel />}
        </section>
      </div>
    </div>
  );
}

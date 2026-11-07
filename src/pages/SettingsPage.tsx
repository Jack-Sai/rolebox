import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToastStore } from "../store/toast";
import type { UserPersona, UserPersonaInput } from "../types";

// 本期只实现「我的分身」；外观（C40）、llama-server（C40）、数据（C46）后续接入。
const TABS = [
  { key: "personas", label: "我的分身", ready: true },
  { key: "appearance", label: "外观", ready: false },
  { key: "server", label: "llama-server", ready: false },
  { key: "data", label: "数据", ready: false },
] as const;

function emptyForm(): UserPersonaInput {
  return { name: "", persona: "" };
}

export function SettingsPage() {
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
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">设置</h1>
      <div className="flex gap-6">
        <nav className="flex w-40 shrink-0 flex-col gap-1">
          {TABS.map((tab) =>
            tab.ready ? (
              <span
                key={tab.key}
                aria-current="page"
                className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
              >
                {tab.label}
              </span>
            ) : (
              <span
                key={tab.key}
                aria-disabled="true"
                className="rounded-lg px-3 py-2 text-sm text-gray-400 opacity-60"
              >
                {tab.label}
              </span>
            ),
          )}
        </nav>

        <section className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-5">
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
        </section>
      </div>
    </div>
  );
}

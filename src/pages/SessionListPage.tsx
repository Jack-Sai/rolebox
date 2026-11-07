import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToastStore } from "../store/toast";
import type { Character, Session } from "../types";

export function SessionListPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const show = useToastStore((state) => state.show);
  // 会话删除走应用内二次确认，取消不删除。
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    void api
      .getCharacters()
      .then((list) => {
        setCharacters(list);
        setCharacterId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  const loadSessions = useCallback(async (id: number | null) => {
    setLoading(true);
    try {
      setSessions(id === null ? [] : await api.getSessions(id));
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions(characterId);
  }, [characterId, loadSessions]);

  const handleDelete = (session: Session) => {
    setPendingDeleteId(session.id);
  };

  const confirmDeleteSession = async () => {
    const id = pendingDeleteId;
    if (id === null) return;
    const session = sessions.find((s) => s.id === id);
    setPendingDeleteId(null);
    try {
      await api.deleteSession(id);
      await loadSessions(characterId);
      show(session ? `会话「${session.title}」已删除` : "会话已删除");
    } catch (cause) {
      show(`删除失败：${String(cause)}`);
    }
  };

  const selectedId = characterId ?? 0;

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">单人会话</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">按角色查看和管理会话</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="选择角色"
            value={selectedId}
            onChange={(event) => setCharacterId(Number(event.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {characters.length === 0 && <option value={0}>暂无角色</option>}
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <Link to={`/sessions/new/${selectedId}`}>
            <Button>
              <Plus size={16} />
              新建会话
            </Button>
          </Link>
        </div>
      </header>

      {loading && <p className="text-sm text-[var(--text-muted)]">加载中…</p>}
      {error && <p className="text-sm text-[var(--destructive)]">加载失败：{error}</p>}
      {!loading && !error && characters.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          还没有角色，请先到「角色」页创建一个。
        </p>
      )}
      {!loading && !error && characters.length > 0 && sessions.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          这个角色还没有会话。
        </p>
      )}

      <ul className="space-y-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <Link to={`/sessions/${session.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{session.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {session.scenario || "（未指定场景）"}
              </p>
            </Link>
            <Button
              variant="danger"
              onClick={() => void handleDelete(session)}
            >
              <Trash2 size={14} />
              删除
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除这个会话？"
        description="消息也会一并删除。"
        confirmLabel="删除"
        danger
        onConfirm={confirmDeleteSession}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

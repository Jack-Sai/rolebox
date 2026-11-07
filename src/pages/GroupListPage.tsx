import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { useToastStore } from "../store/toast";
import type { GroupSession } from "../types";

export function GroupListPage() {
  const [groups, setGroups] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const show = useToastStore((state) => state.show);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await api.getGroupSessions());
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

  const handleDelete = async (group: GroupSession) => {
    if (!window.confirm(`确定删除群聊「${group.title}」？消息与成员都会删除。`)) {
      return;
    }
    try {
      await api.deleteGroupSession(group.id);
      await load();
      show("群聊已删除");
    } catch (cause) {
      show(`删除失败：${String(cause)}`);
    }
  };

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">群聊</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">多个角色同场，按角色逐个发言</p>
        </div>
        <Link to="/groups/new">
          <Button>
            <Plus size={16} />
            新建群聊
          </Button>
        </Link>
      </header>

      {loading && <p className="text-sm text-[var(--text-muted)]">加载中…</p>}
      {error && <p className="text-sm text-[var(--destructive)]">加载失败：{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          还没有群聊。
        </p>
      )}

      <ul className="space-y-3">
        {groups.map((group) => (
          <li
            key={group.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <Link to={`/groups/${group.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{group.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {group.scenario || "（未指定场景）"}
              </p>
            </Link>
            <Button variant="danger" onClick={() => void handleDelete(group)}>
              <Trash2 size={14} />
              删除
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

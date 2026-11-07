import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { truncate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { useToastStore } from "../store/toast";
import type { Character } from "../types";

export function CharacterListPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const show = useToastStore((state) => state.show);

  const load = useCallback(async () => {
    try {
      setCharacters(await api.getCharacters());
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

  const handleDelete = async (character: Character) => {
    if (
      !window.confirm(
        `确定删除角色「${character.name}」？相关会话也会一并删除。`,
      )
    ) {
      return;
    }
    try {
      await api.deleteCharacter(character.id);
      await load();
      show("角色已删除");
    } catch (cause) {
      show(`删除失败：${String(cause)}`);
    }
  };

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">角色</h1>
          <p className="mt-1 text-sm text-gray-500">管理可参与对话的角色及其设定</p>
        </div>
        <Link to="/characters/new">
          <Button>
            <Plus size={16} />
            新建角色
          </Button>
        </Link>
      </header>

      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-600">加载失败：{error}</p>}
      {!loading && !error && characters.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          还没有角色，点「新建角色」开始。
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {characters.map((character) => (
          <article
            key={character.id}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: character.avatar_color }}
              >
                {character.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{character.name}</h2>
                <p className="mt-0.5 truncate text-sm text-gray-500">
                  {truncate(character.tagline, 40)}
                </p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-xs text-gray-500">
              {truncate(character.persona, 120)}
            </p>
            <div className="mt-4 flex gap-2">
              <Link to={`/characters/${character.id}/edit`}>
                <Button variant="ghost">
                  <Pencil size={14} />
                  编辑
                </Button>
              </Link>
              <Button
                variant="danger"
                onClick={() => void handleDelete(character)}
              >
                <Trash2 size={14} />
                删除
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

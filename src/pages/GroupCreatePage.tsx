import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToastStore } from "../store/toast";
import type { Character, UserPersona } from "../types";

export function GroupCreatePage() {
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    void api
      .getCharacters()
      .then(setCharacters)
      .catch((cause) => show(`加载角色失败：${String(cause)}`));
    void api
      .getPersonas()
      .then(setPersonas)
      .catch((cause) => show(`加载分身失败：${String(cause)}`));
  }, [show]);

  const toggle = (id: number) => {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      show("请填写群聊标题");
      return;
    }
    if (selected.length === 0) {
      show("请至少选择一个角色");
      return;
    }
    try {
      const group = await api.createGroupSession({
        title: title.trim(),
        scenario,
        user_persona_id: personaId ? Number(personaId) : null,
        character_ids: selected,
      });
      navigate(`/groups/${group.id}`);
    } catch (cause) {
      show(`创建失败：${String(cause)}`);
    }
  };

  return (
    <div className="p-8">
      <button
        type="button"
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        onClick={() => navigate("/groups")}
      >
        <ArrowLeft size={16} />
        返回群聊列表
      </button>
      <h1 className="mb-6 text-xl font-semibold">新建群聊</h1>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-5"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">群聊标题</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：雨夜的三个人"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">场景设定</span>
          <Textarea
            rows={4}
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            placeholder="时间、地点、当前处境……"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">我的分身</span>
          <select
            aria-label="选择我的分身"
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">不指定</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm">
          <span className="mb-2 block font-medium">
            成员（{selected.length} 个，创建后不可增删）
          </span>
          <div className="space-y-2">
            {characters.length === 0 && (
              <p className="text-xs text-gray-500">还没有角色，请先去创建。</p>
            )}
            {characters.map((character) => (
              <label
                key={character.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(character.id)}
                  onChange={() => toggle(character.id)}
                />
                <span className="font-medium">{character.name}</span>
                <span className="truncate text-xs text-gray-500">
                  {character.tagline}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Button type="submit">创建群聊</Button>
      </form>
    </div>
  );
}

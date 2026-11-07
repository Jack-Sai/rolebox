import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToastStore } from "../store/toast";
import type { Character, UserPersona } from "../types";

export function SessionCreatePage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const [character, setCharacter] = useState<Character | null>(null);
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState("");
  const [personaId, setPersonaId] = useState("");

  useEffect(() => {
    void api
      .getCharacters()
      .then((list) =>
        setCharacter(list.find((item) => item.id === Number(characterId)) ?? null),
      )
      .catch((cause) => show(`加载角色失败：${String(cause)}`));
    void api
      .getPersonas()
      .then(setPersonas)
      .catch((cause) => show(`加载分身失败：${String(cause)}`));
  }, [characterId, show]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      show("请填写会话标题");
      return;
    }
    try {
      const session = await api.createSession({
        character_id: Number(characterId),
        title: title.trim(),
        scenario,
        user_persona_id: personaId ? Number(personaId) : null,
      });
      navigate(`/sessions/${session.id}`);
    } catch (cause) {
      show(`创建失败：${String(cause)}`);
    }
  };

  return (
    <div className="p-8">
      <button
        type="button"
        className="mb-4 flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        onClick={() => navigate("/sessions")}
      >
        <ArrowLeft size={16} />
        返回会话列表
      </button>
      <h1 className="mb-1 text-xl font-semibold">新建会话</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        角色：{character?.name ?? "加载中…"}。切换用户分身会让已有会话的上下文缓存失效。
      </p>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">会话标题</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：雨夜初遇"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">场景设定</span>
          <Textarea
            rows={5}
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
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="">不指定</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">创建并开始</Button>
      </form>
    </div>
  );
}

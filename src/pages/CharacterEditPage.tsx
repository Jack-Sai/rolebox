import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { avatarColor } from "../lib/avatar";
import { buildSingleSystemPrompt } from "../lib/prompt";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToastStore } from "../store/toast";
import type { CharacterInput } from "../types";

function emptyForm(): CharacterInput {
  return {
    name: "",
    tagline: "",
    persona: "",
    avatar_color: avatarColor("新角色"),
  };
}

export function CharacterEditPage() {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const [form, setForm] = useState<CharacterInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 后端没有单角色查询命令，编辑时复用列表接口按 id 取回当前数据。
  useEffect(() => {
    if (!isEdit) return;
    void api
      .getCharacters()
      .then((list) => {
        const found = list.find((item) => item.id === Number(id));
        if (!found) {
          setError("角色不存在");
          return;
        }
        setForm({
          name: found.name,
          tagline: found.tagline,
          persona: found.persona,
          avatar_color: found.avatar_color,
        });
      })
      .catch((cause) => setError(String(cause)));
  }, [id, isEdit]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      show("请填写角色名");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateCharacter(Number(id), form);
      } else {
        await api.createCharacter(form);
      }
      show("已保存");
      navigate("/characters");
    } catch (cause) {
      show(`保存失败：${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  const preview = buildSingleSystemPrompt(form, "", null);

  return (
    <div className="p-8">
      <button
        type="button"
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        onClick={() => navigate("/characters")}
      >
        <ArrowLeft size={16} />
        返回角色列表
      </button>
      <h1 className="mb-6 text-xl font-semibold">
        {isEdit ? "编辑角色" : "新建角色"}
      </h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">角色名</span>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="例如：林黛玉"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">一句话简介</span>
            <Input
              value={form.tagline}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, tagline: event.target.value }))
              }
              placeholder="用于群聊里介绍角色"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">完整设定</span>
            <Textarea
              rows={10}
              value={form.persona}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, persona: event.target.value }))
              }
              placeholder="性格、背景、说话方式……"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">头像颜色</span>
            <input
              type="color"
              value={form.avatar_color}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  avatar_color: event.target.value,
                }))
              }
              className="h-9 w-16 cursor-pointer rounded border border-gray-200 bg-white"
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </form>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-medium">System Prompt 预览</h2>
          <p className="mb-3 text-xs text-gray-500">
            仅展示基础结构。实际会话会追加场景与用户分身，且创建后不再改变。
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed">
            {preview}
          </pre>
        </section>
      </div>
    </div>
  );
}

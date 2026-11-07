import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { createStreamHandler } from "../lib/stream";
import { MessageList } from "../components/chat/MessageList";
import { InputArea } from "../components/chat/InputArea";
import { Button } from "../components/ui/button";
import { useToastStore } from "../store/toast";
import type { Character, Message, Session } from "../types";

// DESIGN 8.3：流式期间用 id < 0 的临时消息，Done 后换成真实 id。
const TEMP_ID = -1;

function tempMessage(sessionId: number): Message {
  return {
    id: TEMP_ID,
    session_id: sessionId,
    role: "assistant",
    content: "",
    version_group: TEMP_ID,
    is_active: true,
    deprecated: false,
    summarized: false,
    created_at: "",
  };
}

export function ChatPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const [session, setSession] = useState<Session | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [current, list, characters] = await Promise.all([
        api.getSession(sessionId),
        api.getMessages(sessionId),
        api.getCharacters(),
      ]);
      setSession(current);
      setMessages(list);
      setCharacter(
        characters.find((item) => item.id === current.character_id) ?? null,
      );
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, [sessionId, setMessages]);

  useEffect(() => {
    void load();
  }, [load]);

  // 稳定回调：不因 ChatPage 的其它状态变化而让子组件收到新函数（坑 #13）。
  const onSend = useCallback(
    (content: string) => {
      void api
        .sendUserMessage(sessionId, content)
        .then((message) => {
          // 只追加，不重建已有对象：历史消息引用稳定是 React.memo 生效的前提（坑 #12）。
          setMessages((previous) => [...previous, message]);
        })
        .catch((cause) => show(`发送失败：${String(cause)}`));
    },
    [sessionId, show],
  );

  const onStop = useCallback(() => {
    void api
      .cancelGeneration(sessionId)
      .catch((cause) => show(`停止失败：${String(cause)}`));
  }, [sessionId, show]);

  const handleGenerate = async () => {
    setStreaming(true);
    setMessages((previous) => [...previous, tempMessage(sessionId)]);

    let cancelled = false;
    const handler = createStreamHandler({
      onAppend: (text) => {
        setMessages((previous) =>
          previous.map((item) =>
            item.id === TEMP_ID
              ? { ...item, content: item.content + text }
              : item,
          ),
        );
      },
      onDone: (message) => {
        setMessages((previous) =>
          previous.map((item) => (item.id === TEMP_ID ? message : item)),
        );
      },
      onError: (message) => show(`生成失败：${message}`),
      onCancelled: () => {
        cancelled = true;
      },
    });

    try {
      const message = await api.generateReply(sessionId, handler);
      // 取消时后端只发 Cancelled 不发 Done，用命令返回值补齐真实 id。
      setMessages((previous) =>
        previous.map((item) => (item.id === TEMP_ID ? message : item)),
      );
    } catch (cause) {
      setMessages((previous) => previous.filter((item) => item.id !== TEMP_ID));
      if (!cancelled) show(`生成失败：${String(cause)}`);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => navigate("/sessions")}
            aria-label="返回会话列表"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-medium">
              {session?.title ?? "加载中…"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {character?.name ?? ""}
              {session?.scenario ? ` · ${session.scenario}` : ""}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => void handleGenerate()}
          disabled={streaming}
        >
          <Sparkles size={16} />
          {streaming ? "生成中…" : "生成回复"}
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}
        {!error && messages.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            还没有消息。发一句话，再点「生成回复」。
          </p>
        )}
        <MessageList messages={messages} />
      </main>

      <footer className="shrink-0 border-t border-gray-200 bg-white p-4">
        <InputArea
          onSend={onSend}
          onStop={onStop}
          streaming={streaming}
        />
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { createStreamHandler } from "../lib/stream";
import { ContextBar } from "../components/chat/ContextBar";
import { MessageList } from "../components/chat/MessageList";
import { InputArea } from "../components/chat/InputArea";
import { Button } from "../components/ui/button";
import { useToastStore } from "../store/toast";
import type { Character, ContextInfo, Message, Session } from "../types";

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
  const [versionsByGroup, setVersionsByGroup] = useState<
    Record<number, Message[]>
  >({});
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);

  // 上下文用量是增强信息，拿不到就不显示进度条，不打断聊天。
  const loadContext = useCallback(async () => {
    try {
      setContextInfo(await api.getContextInfo(sessionId));
    } catch {
      setContextInfo(null);
    }
  }, [sessionId]);

  // 版本信息是增强功能：每条激活的 assistant 消息查一次自己所在的组，失败就静默跳过。
  const loadVersions = useCallback(async (list: Message[]) => {
    const targets = list.filter(
      (item) => item.role === "assistant" && item.id > 0,
    );
    try {
      const entries = await Promise.all(
        targets.map(
          async (item) =>
            [item.version_group, await api.getMessageVersions(item.id)] as const,
        ),
      );
      setVersionsByGroup(Object.fromEntries(entries));
    } catch {
      setVersionsByGroup({});
    }
  }, []);

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
      void loadVersions(list);
      void loadContext();
    } catch (cause) {
      setError(String(cause));
    }
  }, [sessionId, loadVersions, loadContext]);

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

  const onSendNarration = useCallback(
    (content: string) => {
      void api
        .sendNarration(sessionId, content)
        .then((message) => {
          setMessages((previous) => [...previous, message]);
        })
        .catch((cause) => show(`发送旁白失败：${String(cause)}`));
    },
    [sessionId, show],
  );

  const onStop = useCallback(() => {
    void api
      .cancelGeneration(sessionId)
      .catch((cause) => show(`停止失败：${String(cause)}`));
  }, [sessionId, show]);

  const onEditMessage = useCallback(
    (id: number, content: string) => {
      void api
        .updateMessage(id, content)
        .then(() => load())
        .catch((cause) => show(`编辑失败：${String(cause)}`));
    },
    [load, show],
  );

  const onDeleteMessage = useCallback(
    (id: number) => {
      if (
        !window.confirm("确定删除这条消息？之后的消息会标记为「上下文已变」。")
      ) {
        return;
      }
      void api
        .deleteMessage(id)
        .then(() => load())
        .catch((cause) => show(`删除失败：${String(cause)}`));
    },
    [load, show],
  );

  // 用 ref 读最新列表，避免 onActivateVersion 依赖 messages 导致回调每次渲染都变（坑 #13）。
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const onActivateVersion = useCallback(
    (messageId: number) => {
      const hasLater = messagesRef.current.some((item) => item.id > messageId);
      if (
        hasLater &&
        !window.confirm("切换版本后，后续消息的上下文已变，确定切换？")
      ) {
        return;
      }
      void api
        .activateMessageVersion(messageId)
        .then(() => load())
        .catch((cause) => show(`切换版本失败：${String(cause)}`));
    },
    [load, show],
  );

  const onRegenerate = useCallback(
    (messageId: number) => {
      setStreaming(true);
      let cancelled = false;
      const handler = createStreamHandler({
        onAppend: () => {},
        onDone: () => {},
        onError: (message) => show(`重新生成失败：${message}`),
        onCancelled: () => {
          cancelled = true;
        },
      });
      void api
        .regenerateMessage(messageId, handler)
        .then(() => load())
        .catch((cause) => {
          if (!cancelled) show(`重新生成失败：${String(cause)}`);
        })
        .finally(() => setStreaming(false));
    },
    [load, show],
  );

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
      // 生成结束后真实 prompt_tokens 已经写进 AppState，刷新进度条。
      void loadContext();
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

      {contextInfo && (
        <ContextBar
          used={contextInfo.used}
          limit={contextInfo.limit}
          isAccurate={contextInfo.isAccurate}
        />
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}
        {!error && messages.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            还没有消息。发一句话，再点「生成回复」。
          </p>
        )}
        <MessageList
          messages={messages}
          onEdit={onEditMessage}
          onDelete={onDeleteMessage}
          versionsByGroup={versionsByGroup}
          onActivateVersion={onActivateVersion}
          onRegenerate={onRegenerate}
        />
      </main>

      <footer className="shrink-0 border-t border-gray-200 bg-white p-4">
        <InputArea
          onSend={onSend}
          onSendNarration={onSendNarration}
          onStop={onStop}
          streaming={streaming}
        />
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { createStreamHandler } from "../lib/stream";
import { MessageBubble } from "../components/chat/MessageBubble";
import { NarrationLine } from "../components/chat/NarrationLine";
import { SummaryCard } from "../components/chat/SummaryCard";
import { InputArea } from "../components/chat/InputArea";
import { Button } from "../components/ui/button";
import { useToastStore } from "../store/toast";
import type { GroupMember, GroupMessage, GroupSession, Message } from "../types";

const TEMP_ID = -1;

function asMessage(message: GroupMessage): Message {
  return {
    id: message.id,
    session_id: message.group_id,
    role: message.role,
    content: message.content,
    version_group: message.version_group,
    is_active: message.is_active,
    deprecated: message.deprecated,
    summarized: message.summarized,
    created_at: message.created_at,
  };
}

function tempMessage(groupId: number, characterId: number): GroupMessage {
  return {
    id: TEMP_ID,
    group_id: groupId,
    character_id: characterId,
    role: "assistant",
    content: "",
    version_group: TEMP_ID,
    is_active: true,
    deprecated: false,
    summarized: false,
    created_at: "",
  };
}

export function GroupChatPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const [group, setGroup] = useState<GroupSession | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [groups, memberList, messageList] = await Promise.all([
        api.getGroupSessions(),
        api.getGroupMembers(groupId),
        api.getGroupMessages(groupId),
      ]);
      setGroup(groups.find((item) => item.id === groupId) ?? null);
      setMembers(memberList);
      setMessages(messageList);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSend = useCallback(
    (content: string) => {
      void api
        .sendGroupUserMessage(groupId, content)
        .then((message) => setMessages((previous) => [...previous, message]))
        .catch((cause) => show(`发送失败：${String(cause)}`));
    },
    [groupId, show],
  );

  const onSendNarration = useCallback(
    (content: string) => {
      void api
        .sendGroupNarration(groupId, content)
        .then((message) => setMessages((previous) => [...previous, message]))
        .catch((cause) => show(`发送旁白失败：${String(cause)}`));
    },
    [groupId, show],
  );

  const onStop = useCallback(() => {
    void api
      .cancelGroupGeneration(groupId)
      .catch((cause) => show(`停止失败：${String(cause)}`));
  }, [groupId, show]);

  const handleGenerate = async (characterId: number) => {
    setStreaming(true);
    setGeneratingId(characterId);
    setMessages((previous) => [...previous, tempMessage(groupId, characterId)]);

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
      onDone: () => {},
      onDoneGroup: (message) => {
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
      const message = await api.generateGroupReply(
        groupId,
        characterId,
        handler,
      );
      setMessages((previous) =>
        previous.map((item) => (item.id === TEMP_ID ? message : item)),
      );
    } catch (cause) {
      setMessages((previous) => previous.filter((item) => item.id !== TEMP_ID));
      if (!cancelled) show(`生成失败：${String(cause)}`);
    } finally {
      setStreaming(false);
      setGeneratingId(null);
    }
  };

  const nameOf = (characterId: number | null) =>
    members.find((member) => member.character_id === characterId)?.name ??
    "未知角色";

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => navigate("/groups")}
            aria-label="返回群聊列表"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-medium">
              {group?.title ?? "加载中…"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {group?.scenario ?? ""}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {members.map((member) => (
            <Button
              key={member.character_id}
              variant="ghost"
              disabled={streaming}
              onClick={() => void handleGenerate(member.character_id)}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: member.avatar_color }}
              />
              {generatingId === member.character_id ? "生成中…" : member.name}
            </Button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}
        {!error && messages.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            还没有消息。点上方角色名让 TA 先开口。
          </p>
        )}
        <div className="space-y-3">
          {messages.map((message) => {
            switch (message.role) {
              case "narration":
                return (
                  <NarrationLine key={message.id} content={message.content} />
                );
              case "summary":
                return <SummaryCard key={message.id} content={message.content} />;
              case "user":
                return (
                  <MessageBubble key={message.id} message={asMessage(message)} />
                );
              case "assistant":
                return (
                  <div key={message.id} className="space-y-0.5">
                    <p className="text-xs text-gray-400">
                      {nameOf(message.character_id)}
                    </p>
                    <MessageBubble message={asMessage(message)} />
                  </div>
                );
              default:
                return (
                  <div key={message.id} data-testid="unknown-block">
                    未知消息类型
                  </div>
                );
            }
          })}
        </div>
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

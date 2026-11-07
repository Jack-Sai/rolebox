import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { createStreamHandler } from "../lib/stream";
import { MemberBar } from "../components/chat/MemberBar";
import { MessageBubble, defaultRenderContent } from "../components/chat/MessageBubble";
import { NarrationLine } from "../components/chat/NarrationLine";
import { SummaryCard } from "../components/chat/SummaryCard";
import { InputArea } from "../components/chat/InputArea";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
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
  // 群聊删除走应用内二次确认：确认框打开期间不碰后端，取消就什么都不会发生。
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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

  const onEditGroupMessage = useCallback(
    (id: number, content: string) => {
      void api
        .updateGroupMessage(id, content)
        .then(() => load())
        .catch((cause) => show(`编辑失败：${String(cause)}`));
    },
    [load, show],
  );

  // 只打开确认框，绝不在这里调用 delete_group_message。
  const onDeleteGroupMessage = useCallback((id: number) => {
    setPendingDeleteId(id);
  }, []);

  const confirmDeleteGroupMessage = useCallback(() => {
    const id = pendingDeleteId;
    if (id === null) return;
    setPendingDeleteId(null);
    void api
      .deleteGroupMessage(id)
      .then(() => load())
      .catch((cause) => show(`删除失败：${String(cause)}`));
  }, [pendingDeleteId, load, show]);

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
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={() => navigate("/groups")}
            aria-label="返回群聊列表"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-medium">
              {group?.title ?? "加载中…"}
            </h1>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {group?.scenario ?? ""}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <MemberBar
            members={members}
            generatingId={generatingId}
            disabled={streaming}
            onGenerate={(characterId) => void handleGenerate(characterId)}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <p className="text-sm text-[var(--destructive)]">加载失败：{error}</p>}
        {!error && messages.length === 0 && (
            <p className="text-center text-sm text-[var(--text-muted)]">
              还没有消息。点上方角色名让 TA 先开口。
            </p>
        )}
        <div className="space-y-3">
          {messages.map((message) => {
            switch (message.role) {
              case "narration":
                // 旁白保留原来的居中斜体视觉，和普通消息一样可编辑、删除。
                return (
                  <NarrationLine
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    onEdit={onEditGroupMessage}
                    onDelete={onDeleteGroupMessage}
                  />
                );
              case "summary":
                return <SummaryCard key={message.id} content={message.content} />;
              case "user":
                return (
                  <MessageBubble
                    key={message.id}
                    message={asMessage(message)}
                    renderContent={defaultRenderContent}
                    onEdit={onEditGroupMessage}
                    onDelete={onDeleteGroupMessage}
                  />
                );
              case "assistant":
                return (
                  <div key={message.id} className="space-y-0.5">
                    <p className="text-xs text-[var(--text-muted)]">
                      {nameOf(message.character_id)}
                    </p>
                    <MessageBubble
                      message={asMessage(message)}
                      renderContent={defaultRenderContent}
                      onEdit={onEditGroupMessage}
                      onDelete={onDeleteGroupMessage}
                    />
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

      <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <InputArea
          onSend={onSend}
          onSendNarration={onSendNarration}
          onStop={onStop}
          streaming={streaming}
        />
      </footer>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除这条消息？"
        description="之后的消息会标记为「上下文已变」。"
        confirmLabel="删除"
        danger
        onConfirm={confirmDeleteGroupMessage}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Quote, Send, Square } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface InputAreaProps {
  onSend: (content: string) => void;
  onSendNarration?: (content: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
}

export function InputArea({
  onSend,
  onSendNarration,
  onStop,
  streaming = false,
  disabled,
}: InputAreaProps) {
  const [value, setValue] = useState("");
  // 旁白模式只影响发送走哪条命令，不改变输入框内容。
  const [narration, setNarration] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled || streaming) return;
    if (narration && onSendNarration) {
      onSendNarration(text);
    } else {
      onSend(text);
    }
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <textarea
          aria-label="消息内容"
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={narration ? "输入旁白…" : "输入消息…"}
          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          aria-pressed={narration}
          onClick={() => setNarration((previous) => !previous)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs",
            narration
              ? "bg-amber-100 text-amber-800"
              : "text-gray-500 hover:bg-gray-100",
          )}
        >
          <Quote size={12} />
          旁白模式
        </button>
      </div>
      {streaming && onStop ? (
        <Button type="button" variant="danger" onClick={onStop}>
          <Square size={14} />
          停止
        </Button>
      ) : (
        <Button type="submit" disabled={disabled || !value.trim()}>
          <Send size={16} />
          发送
        </Button>
      )}
    </form>
  );
}

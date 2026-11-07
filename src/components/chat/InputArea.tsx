import { useState, type FormEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "../ui/button";

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
}

export function InputArea({
  onSend,
  onStop,
  streaming = false,
  disabled,
}: InputAreaProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled || streaming) return;
    onSend(text);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        aria-label="消息内容"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入消息…"
        className="min-w-0 flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
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

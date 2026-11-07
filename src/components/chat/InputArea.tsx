import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "../ui/button";

interface InputAreaProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
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
      <Button type="submit" disabled={disabled || !value.trim()}>
        <Send size={16} />
        发送
      </Button>
    </form>
  );
}

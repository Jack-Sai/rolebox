import { cn } from "../../lib/utils";
import type { GroupMember } from "../../types";

export interface MemberBarProps {
  members: GroupMember[];
  generatingId: number | null;
  disabled: boolean;
  onGenerate: (characterId: number) => void;
}

/// 群聊成员头像条：点谁就让谁说。生成期间只有当前成员亮着，其他成员置灰。
export function MemberBar({
  members,
  generatingId,
  disabled,
  onGenerate,
}: MemberBarProps) {
  return (
    <div className="flex flex-wrap gap-1" data-testid="member-bar">
      {members.map((member) => {
        const generating = generatingId === member.character_id;
        const muted = generatingId !== null && !generating;

        return (
          <button
            key={member.character_id}
            type="button"
            disabled={disabled}
            onClick={() => onGenerate(member.character_id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-opacity",
              generating
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-700",
              muted && "opacity-40",
              disabled && "cursor-not-allowed",
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: member.avatar_color }}
            />
            {generating ? "生成中…" : member.name}
          </button>
        );
      })}
    </div>
  );
}

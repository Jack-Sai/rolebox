import { NavLink } from "react-router-dom";
import { MessageSquare, MessagesSquare, Settings, Users } from "lucide-react";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";

// 文案走字典，key 与 zh.ts 的 nav 对齐。
const items = [
  { to: "/characters", key: "characters", icon: Users },
  { to: "/sessions", key: "sessions", icon: MessageSquare },
  { to: "/groups", key: "groups", icon: MessagesSquare },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

export function Sidebar() {
  const t = useI18n();

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="px-4 py-5 text-lg font-semibold">RoleBox</div>
      <nav className="flex flex-col gap-1 px-2">
        {items.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
                isActive && "bg-[var(--accent)]/10 font-medium text-[var(--accent)]",
              )
            }
          >
            <Icon size={18} />
            {t.nav[key]}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

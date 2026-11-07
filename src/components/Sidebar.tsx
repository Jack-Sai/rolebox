import { NavLink } from "react-router-dom";
import { MessageSquare, MessagesSquare, Settings, Users } from "lucide-react";
import { cn } from "../lib/utils";

const items = [
  { to: "/characters", label: "角色", icon: Users, ready: true },
  { to: "/sessions", label: "单人会话", icon: MessageSquare, ready: false },
  { to: "/groups", label: "群聊", icon: MessagesSquare, ready: false },
  { to: "/settings", label: "设置", icon: Settings, ready: false },
] as const;

export function Sidebar() {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="px-4 py-5 text-lg font-semibold">RoleBox</div>
      <nav className="flex flex-col gap-1 px-2">
        {items.map(({ to, label, icon: Icon, ready }) =>
          ready ? (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100",
                  isActive && "bg-indigo-50 font-medium text-indigo-700",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ) : (
            <span
              key={to}
              aria-disabled="true"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 opacity-60"
            >
              <Icon size={18} />
              {label}
            </span>
          ),
        )}
      </nav>
    </aside>
  );
}

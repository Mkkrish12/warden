import { ArrowLeftRight, FileText, LayoutGrid, Settings, Shield } from "lucide-react";
import type { ConnectionState } from "../lib/useAgentStream";

export type PageId = "dashboard" | "invoices" | "transactions" | "policy" | "settings";

const NAV: { id: PageId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "policy", label: "Policy", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
];

const CONNECTION: Record<ConnectionState, { label: string; dot: string }> = {
  connecting: { label: "Connecting", dot: "bg-text-tertiary" },
  live: { label: "Live", dot: "bg-brand" },
  reconnecting: { label: "Reconnecting", dot: "bg-warning" },
  error: { label: "Offline", dot: "bg-critical" },
};

interface Props {
  active: PageId;
  onNavigate: (page: PageId) => void;
  connection: ConnectionState;
  pendingCount: number;
}

export function Sidebar({ active, onNavigate, connection, pendingCount }: Props) {
  const conn = CONNECTION[connection];

  return (
    <nav className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand">
          <Shield className="h-4 w-4 text-white" strokeWidth={2.5} />
        </span>
        <span className="text-[15px] font-semibold text-text">Warden</span>
      </div>

      <ul className="mt-1 flex-1 px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? "page" : undefined}
                className={`mb-0.5 flex w-full items-center gap-3 rounded-lg border-l-[3px] py-2 pr-3 pl-3 text-left text-[13px] transition-colors ${
                  isActive
                    ? "border-l-brand bg-hover font-semibold text-text"
                    : "border-l-transparent font-medium text-text-sub hover:bg-hover"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} />
                <span className="flex-1">{label}</span>
                {id === "invoices" && pendingCount > 0 && (
                  <span className="tnum rounded-full bg-attention-bg px-1.5 py-0.5 text-[10px] font-semibold text-[#7E4B00]">
                    {pendingCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-5 py-3">
        <span className="flex items-center gap-2 text-xs text-text-sub">
          <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} />
          {conn.label}
        </span>
      </div>
    </nav>
  );
}

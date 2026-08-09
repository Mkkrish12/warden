import { ArrowLeftRight, Bot, Building2, CreditCard, FileText, LayoutGrid, Settings } from "lucide-react";
import type { ConnectionState } from "../lib/useAgentStream";

export type PageId = "dashboard" | "invoices" | "cards" | "transactions" | "policy" | "settings";

const NAV: { id: PageId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "policy", label: "Approved Vendors", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

interface Props {
  active: PageId;
  onNavigate: (page: PageId) => void;
  connection: ConnectionState;
  pendingCount: number;
}

export function Sidebar({ active, onNavigate, pendingCount }: Props) {
  return (
    <nav className="flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
          <Bot className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
        <span className="text-[16px] font-bold tracking-tight text-text">Warden</span>
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
                className={`mb-0.5 flex w-full items-center gap-3 rounded-lg border-l-[3px] py-2.5 pr-3 pl-3 text-left text-[14px] transition-colors ${
                  isActive
                    ? "border-l-brand bg-hover font-semibold text-text"
                    : "border-l-transparent font-medium text-text-sub hover:bg-hover"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} />
                <span className="flex-1">{label}</span>
                {id === "invoices" && pendingCount > 0 && (
                  <span className="tnum rounded-full bg-attention-bg px-1.5 py-0.5 text-[11px] font-semibold text-[#7E4B00]">
                    {pendingCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

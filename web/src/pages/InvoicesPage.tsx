import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { InvoiceRecord, InvoiceStatus } from "@warden/shared";
import { Badge, Card, EmptyState, PageTitle, Table } from "../components/ui";
import { STATUS_TONE, dateShort, usd } from "../lib/format";

interface Props {
  invoices: InvoiceRecord[];
  onOpenInvoice: (invoiceId: string) => void;
}

const FILTERS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "awaiting_approval", label: "Escalated" },
  { value: "blocked", label: "Blocked" },
  { value: "pending", label: "Pending" },
];

export function InvoicesPage({ invoices, onOpenInvoice }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (!q) return true;
      return (
        inv.invoiceId.toLowerCase().includes(q) ||
        (inv.vendorName ?? "").toLowerCase().includes(q) ||
        (inv.poRef ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, query, status]);

  return (
    <>
      <PageTitle title="Invoices" subtitle="Supplier invoices ingested from the AP inbox" />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoice, vendor, or PO"
            className="h-8 w-full rounded-lg border border-[#BABEC3] bg-surface pr-3 pl-9 text-[13px] text-text placeholder:text-text-tertiary focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as InvoiceStatus | "all")}
          className="h-8 rounded-lg border border-[#BABEC3] bg-surface px-2 text-[13px] text-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState
            message={invoices.length === 0 ? "Waiting for invoices…" : "No invoices match."}
          />
        ) : (
          <Table
            head={
              <>
                <th className="px-5 py-2.5 font-medium">Invoice ID</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-10 px-5 py-2.5" />
              </>
            }
          >
            {filtered.map((inv) => {
              const tone = STATUS_TONE[inv.status];
              const firstEvent = inv.events[0];
              return (
                <tr
                  key={inv.invoiceId}
                  onClick={() => onOpenInvoice(inv.invoiceId)}
                  className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-hover"
                >
                  <td className="tnum px-5 py-3 font-mono text-[13px] text-text">{inv.invoiceId}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-text">
                    {inv.vendorName ?? "—"}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-text">
                    {usd(inv.amount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-text-sub">
                    {firstEvent ? dateShort(firstEvent.ts) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={tone.tone}>{tone.label}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight className="inline h-4 w-4 text-text-tertiary" />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

import { useMemo } from "react";
import type { AgentEvent, InvoiceRecord } from "@warden/shared";
import { Badge, Card, CardHeader, EmptyState, PageTitle } from "../components/ui";
import { EVENT_LABEL, clockTime, usd, usdCompact } from "../lib/format";
import { VendorSpendChart } from "../components/VendorSpendChart";

interface Props {
  invoices: InvoiceRecord[];
  events: AgentEvent[];
  onOpenInvoice: (invoiceId: string) => void;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-[13px] font-medium text-text-sub">{label}</p>
      <p className="tnum mt-2 text-[32px] leading-none font-bold text-brand">{value}</p>
    </Card>
  );
}

export function DashboardPage({ invoices, events, onOpenInvoice }: Props) {
  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const totalPaid = paid.reduce((sum, i) => sum + (i.amount ?? 0), 0);

    const now = new Date();
    const thisMonth = paid
      .filter((i) => {
        const last = i.events.at(-1);
        if (!last) return false;
        const d = new Date(last.ts);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, i) => sum + (i.amount ?? 0), 0);

    return {
      totalPaid,
      pending: invoices.filter((i) => i.status === "awaiting_approval").length,
      blocked: invoices.filter((i) => i.status === "blocked").length,
      thisMonth,
    };
  }, [invoices]);

  const vendorSpend = useMemo(() => {
    const byVendor = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== "paid" || !inv.vendorName) continue;
      byVendor.set(inv.vendorName, (byVendor.get(inv.vendorName) ?? 0) + (inv.amount ?? 0));
    }
    return [...byVendor.entries()]
      .map(([vendor, amount]) => ({ vendor, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [invoices]);

  const recent = useMemo(() => [...events].slice(-10).reverse(), [events]);

  const vendorFor = (invoiceId: string) =>
    invoices.find((i) => i.invoiceId === invoiceId)?.vendorName ?? invoiceId;
  const amountFor = (invoiceId: string) => invoices.find((i) => i.invoiceId === invoiceId)?.amount;

  return (
    <>
      <PageTitle title="Dashboard" subtitle="Evergreen Home Co · supplier payments" />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Paid" value={usdCompact(stats.totalPaid)} />
        <StatCard label="Pending" value={String(stats.pending)} />
        <StatCard label="Blocked" value={String(stats.blocked)} />
        <StatCard label="This Month" value={usdCompact(stats.thisMonth)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card padding={false}>
          <CardHeader title="Recent Activity" />
          {recent.length === 0 ? (
            <EmptyState message="Waiting for the agent to process invoices…" />
          ) : (
            <ul>
              {recent.map((event) => {
                const meta = EVENT_LABEL[event.type];
                const amount = amountFor(event.invoiceId);
                return (
                  <li key={event.id} className="animate-in border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(event.invoiceId)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-hover"
                    >
                      <span className="tnum w-11 shrink-0 text-xs text-text-tertiary">
                        {clockTime(event.ts)}
                      </span>
                      <span className="w-[100px] shrink-0">
                        <Badge tone={event.ok ? meta.tone : meta.tone === "neutral" ? "critical" : meta.tone}>
                          {meta.label}
                        </Badge>
                      </span>
                      <span className="flex-1 truncate text-[13px] font-medium text-text">
                        {vendorFor(event.invoiceId)}
                      </span>
                      <span className="tnum shrink-0 text-[13px] text-text-sub">{usd(amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padding={false}>
          <CardHeader title="Vendor Spend" />
          <div className="px-5 py-4">
            {vendorSpend.length === 0 ? (
              <EmptyState message="No settled payments yet." />
            ) : (
              <VendorSpendChart data={vendorSpend} onBarClick={onOpenInvoice} invoices={invoices} />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

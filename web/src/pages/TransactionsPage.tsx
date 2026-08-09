import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import type { AgentEvent, InvoiceRecord } from "@warden/shared";
import { Badge, Card, EmptyState, PageTitle, Table } from "../components/ui";
import { TX_TONE, type TxType, explorerTxUrl, shortHash, usd } from "../lib/format";

interface Props {
  events: AgentEvent[];
  invoices: InvoiceRecord[];
}

interface TxRow {
  hash: string;
  type: TxType;
  vendor: string;
  amount?: number;
  block?: number;
  ts: number;
}

/**
 * Derives on-chain history from the event stream: any event carrying a tx hash
 * corresponds to exactly one contract write.
 */
function toTxRows(events: AgentEvent[], invoices: InvoiceRecord[]): TxRow[] {
  const vendorOf = (id: string) => invoices.find((i) => i.invoiceId === id)?.vendorName ?? id;
  const amountOf = (id: string) => invoices.find((i) => i.invoiceId === id)?.amount;

  const rows: TxRow[] = [];

  for (const event of events) {
    const data = event.data ?? {};
    const hash = (data.txHash ?? data.auditTxHash) as string | undefined;
    if (typeof hash !== "string") continue;

    const type: TxType =
      event.type === "reconciled"
        ? "InvoicePaid"
        : event.type === "blocked"
          ? "InvoiceBlocked"
          : "VendorSet";

    rows.push({
      hash,
      type,
      vendor: vendorOf(event.invoiceId),
      amount: amountOf(event.invoiceId),
      block: typeof data.blockNumber === "number" ? data.blockNumber : undefined,
      ts: event.ts,
    });
  }

  return rows.reverse();
}

export function TransactionsPage({ events, invoices }: Props) {
  const rows = useMemo(() => toTxRows(events, invoices), [events, invoices]);

  return (
    <>
      <PageTitle
        title="On-Chain Transactions"
        subtitle="Every policy write and settlement recorded on Monad testnet"
      />

      <Card padding={false}>
        {rows.length === 0 ? (
          <EmptyState message="No on-chain transactions yet." />
        ) : (
          <Table
            head={
              <>
                <th className="px-5 py-2.5 font-medium">Tx Hash</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Block</th>
                <th className="px-5 py-2.5 font-medium">Timestamp</th>
              </>
            }
          >
            {rows.map((row, i) => (
              <tr
                key={`${row.hash}-${i}`}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-hover"
              >
                <td className="px-5 py-3">
                  <a
                    href={explorerTxUrl(row.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="tnum inline-flex items-center gap-1.5 font-mono text-[13px] text-brand hover:underline"
                  >
                    {shortHash(row.hash)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TX_TONE[row.type]}>{row.type}</Badge>
                </td>
                <td className="px-4 py-3 text-[13px] text-text">{row.vendor}</td>
                <td className="tnum px-4 py-3 text-right text-[13px] text-text-sub">
                  {row.type === "InvoicePaid" ? usd(row.amount) : "—"}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-text-tertiary">
                  {row.block ?? "—"}
                </td>
                <td className="tnum px-5 py-3 text-[13px] text-text-sub">
                  {new Date(row.ts).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

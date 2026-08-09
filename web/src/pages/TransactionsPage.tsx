import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import type { AgentEvent, InvoiceRecord } from "@warden/shared";
import { Badge, Button, Card, EmptyState, PageTitle, Table } from "../components/ui";
import { API_BASE } from "../lib/useAgentStream";
import { TX_TONE, explorerTxUrl, shortHash, usd, clockTime, dateShort } from "../lib/format";

// Props kept for API compatibility with App.tsx (not used — Monad is the source).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  events: AgentEvent[];
  invoices: InvoiceRecord[];
}

interface TxRow {
  txHash: string;
  type: "InvoicePaid" | "InvoiceBlocked";
  invoiceId: string;
  vendorName: string | null;
  amount: number | null;
  block: number;
  ts: number;
  cardId: string | null;
  last4: string | null;
  reason: string | null;
}

interface Payload {
  rows: TxRow[];
  policyAddress?: string;
  chainId?: number;
  error?: string;
}

export function TransactionsPage(_props: Props) {
  const [payload, setPayload] = useState<Payload>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`${API_BASE}/api/transactions`);
      const raw = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      const looksJson =
        contentType.includes("application/json") ||
        raw.trimStart().startsWith("{") ||
        raw.trimStart().startsWith("[");

      if (!looksJson) {
        throw new Error(
          res.status === 404
            ? "Agent is missing /api/transactions — restart pnpm demo to pick up the new route"
            : `Agent returned non-JSON (HTTP ${res.status}) — restart pnpm demo`,
        );
      }

      let data: Payload;
      try {
        data = JSON.parse(raw) as Payload;
      } catch {
        throw new Error(
          `Agent returned invalid JSON (HTTP ${res.status}) — restart pnpm demo`,
        );
      }

      if (!res.ok && !data.rows) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setPayload(data);
      if (data.error) setError(data.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = payload?.rows ?? [];

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageTitle
          title="On-Chain Transactions"
          subtitle="Read live from Monad testnet — persists across agent restarts"
        />
        <Button onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card padding={false}>
        {error && rows.length === 0 ? (
          <EmptyState message={`Could not reach the agent: ${error}`} />
        ) : loading && rows.length === 0 ? (
          <EmptyState message="Querying Monad testnet…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No on-chain transactions yet." />
        ) : (
          <Table
            head={
              <>
                <th className="px-5 py-2.5 font-medium">Tx Hash</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Card</th>
                <th className="px-4 py-2.5 font-medium">Block</th>
                <th className="px-5 py-2.5 font-medium">Time</th>
              </>
            }
          >
            {rows.map((row, i) => (
              <tr
                key={`${row.txHash}-${i}`}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-hover"
              >
                <td className="px-5 py-3">
                  <a
                    href={explorerTxUrl(row.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="tnum inline-flex items-center gap-1.5 font-mono text-[13px] text-brand hover:underline"
                  >
                    {shortHash(row.txHash)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TX_TONE[row.type]}>{row.type}</Badge>
                </td>
                <td className="tnum px-4 py-3 font-mono text-[12px] text-text-sub">
                  {row.invoiceId.startsWith("0x") ? row.invoiceId.slice(0, 10) + "…" : row.invoiceId}
                </td>
                <td className="px-4 py-3 text-[13px] text-text">{row.vendorName ?? "—"}</td>
                <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-text">
                  {row.type === "InvoicePaid" ? usd(row.amount ?? undefined) : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.last4 ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-text-sub">
                      <CreditCard className="h-3.5 w-3.5 text-text-tertiary" />
                      <span className="tnum font-mono">•••• {row.last4}</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-text-tertiary">—</span>
                  )}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-text-tertiary">{row.block}</td>
                <td className="px-5 py-3 text-[13px] text-text-sub">
                  {row.ts ? (
                    <span title={new Date(row.ts).toISOString()}>
                      {dateShort(row.ts)} {clockTime(row.ts)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {rows.length > 0 && (
        <p className="mt-3 text-xs text-text-tertiary">
          {rows.length} transaction{rows.length !== 1 ? "s" : ""} · data from Monad testnet ·{" "}
          <a
            href={`https://testnet.monadexplorer.com/address/${payload?.policyAddress}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            view contract ↗
          </a>
        </p>
      )}
    </>
  );
}

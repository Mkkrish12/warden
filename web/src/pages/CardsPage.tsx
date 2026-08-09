import { useCallback, useEffect, useState } from "react";
import { CreditCard, Lock, RefreshCw } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageTitle, Table } from "../components/ui";
import { API_BASE } from "../lib/useAgentStream";
import { clockTime, usd } from "../lib/format";

interface RainCardRow {
  cardId: string;
  invoiceId: string;
  vendorName: string | null;
  invoiceAmount: number | null;
  last4: string | null;
  mintedAt: number;
  rain: {
    status: string | null;
    limitCents: number | null;
    limitFrequency: string | null;
    expirationMonth: string | number | null;
    expirationYear: string | number | null;
    type: string | null;
  } | null;
  error: string | null;
}

interface Payload {
  issuer: string;
  live: boolean;
  cards: RainCardRow[];
}

/**
 * `canceled` is the good outcome — the card spent once and died. Rain flips this
 * asynchronously a few minutes after settlement, so a freshly minted card reads
 * "active"; that's shown as pending cancellation rather than as a problem.
 */
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="neutral">unknown</Badge>;
  if (status === "canceled" || status === "cancelled") {
    return <Badge tone="success">Spent · canceled</Badge>;
  }
  if (status === "active") return <Badge tone="info">Spent · cancelling</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export function CardsPage() {
  const [payload, setPayload] = useState<Payload>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(undefined);
    try {
      const url = `${API_BASE}/api/rain/cards${force ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      setPayload((await res.json()) as Payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = payload?.cards ?? [];
  const allSpent =
    cards.length > 0 &&
    cards.every((c) => c.rain?.status === "canceled" || c.rain?.status === "cancelled");

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageTitle
          title="Issued Cards"
          subtitle="Live card state fetched from the Rain API — not from our own records"
        />
        <Button onClick={() => void load(true)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {payload && !payload.live && (
        <Card className="mb-5 border border-critical bg-critical-bg">
          <p className="text-[13px] font-semibold text-critical">
            Card issuer is “{payload.issuer}”, not Rain.
          </p>
          <p className="mt-1 text-[13px] text-text">
            Set RAIN_API_KEY and RAIN_USER_ID, then restart the agent.
          </p>
        </Card>
      )}

      {cards.length > 0 && payload?.live && (
        <Card className="mb-5 border border-brand bg-brand-bg">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div>
              <p className="text-[13px] font-semibold text-brand">
                Every limit below is a lifetime cap, set to one invoice.
              </p>
              <p className="mt-1 text-[13px] text-text">
                Rain enforces the cap for the life of the card — not per month — so a card can
                never spend more than the invoice it was minted for.
                {allSpent
                  ? " All cards here have already been canceled by Rain after their single payment."
                  : " Rain cancels each card shortly after its payment settles; recently minted cards may still read active."}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card padding={false}>
        {error ? (
          <EmptyState message={`Could not reach the agent: ${error}`} />
        ) : loading && cards.length === 0 ? (
          <EmptyState message="Loading cards from Rain…" />
        ) : cards.length === 0 ? (
          <EmptyState message="No cards issued yet." />
        ) : (
          <Table
            head={
              <>
                <th className="px-5 py-2.5 font-medium">Card</th>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 text-right font-medium">Rain Limit</th>
                <th className="px-4 py-2.5 font-medium">Reuse</th>
                <th className="px-5 py-2.5 font-medium">Rain Status</th>
              </>
            }
          >
            {cards.map((c) => (
              <tr
                key={c.cardId}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-hover"
              >
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-text-tertiary" />
                    <span className="tnum font-mono text-[13px] text-text">
                      •••• {c.last4 ?? "????"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-tertiary">
                    minted {clockTime(c.mintedAt)}
                  </span>
                </td>
                <td className="tnum px-4 py-3 font-mono text-[13px] text-text-sub">
                  {c.invoiceId}
                </td>
                <td className="px-4 py-3 text-[13px] text-text">{c.vendorName ?? "—"}</td>
                <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-text">
                  {usd(c.invoiceAmount ?? undefined)}
                </td>
                <td className="tnum px-4 py-3 text-right text-[13px] text-text-sub">
                  {c.rain?.limitCents != null ? usd(c.rain.limitCents / 100) : "—"}
                </td>
                <td className="px-4 py-3">
                  {c.rain?.limitFrequency === "allTime" ? (
                    <Badge tone="success">Lifetime cap</Badge>
                  ) : (
                    <span className="text-[13px] text-text-sub">
                      {c.rain?.limitFrequency ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {c.error ? (
                    <span className="text-[13px] text-critical">{c.error.slice(0, 40)}</span>
                  ) : (
                    <StatusBadge status={c.rain?.status ?? null} />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-text-tertiary">
        Rain applies a 1.2× pre-authorization buffer to every card limit. The agent still scopes
        each card to the exact invoice amount — the buffer is Rain's headroom for holds, and the
        cap is lifetime, so a card can never spend more than that total.
      </p>
    </>
  );
}

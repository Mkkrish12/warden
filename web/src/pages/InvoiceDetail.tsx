import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Lock, RefreshCw, X } from "lucide-react";
import type { InvoiceRecord } from "@warden/shared";
import { Badge, Button, MonoPill } from "../components/ui";
import { EVENT_LABEL, STATUS_TONE, clockTime, explorerTxUrl, expiresIn, usd } from "../lib/format";
import { API_BASE } from "../lib/useAgentStream";

interface Props {
  invoice: InvoiceRecord;
  busy: boolean;
  onClose: () => void;
  onApprove: (invoiceId: string) => void;
  onReject: (invoiceId: string) => void;
}

interface RainCard {
  id: string;
  status?: string;
  type?: string;
  expirationMonth?: number | string;
  expirationYear?: number | string;
  limit?: { amount: number; frequency?: string };
}

function ChipSvg() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="35" height="27" rx="3.5" fill="#C9A84C" stroke="#A07830" strokeWidth="0.5" />
      <line x1="12" y1="1" x2="12" y2="27" stroke="#A07830" strokeWidth="0.5" />
      <line x1="24" y1="1" x2="24" y2="27" stroke="#A07830" strokeWidth="0.5" />
      <line x1="1" y1="10" x2="35" y2="10" stroke="#A07830" strokeWidth="0.5" />
      <line x1="1" y1="18" x2="35" y2="18" stroke="#A07830" strokeWidth="0.5" />
      <rect x="12" y="10" width="12" height="8" fill="#B8922A" />
    </svg>
  );
}

function CardStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;
  if (status === "canceled" || status === "cancelled")
    return <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">Spent · Canceled</span>;
  if (status === "active")
    return <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">Active</span>;
  return <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">{status}</span>;
}

function VirtualCardPanel({ invoice }: { invoice: InvoiceRecord }) {
  const [rainCard, setRainCard] = useState<RainCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function fetchCard() {
    if (!invoice.cardId) return;
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`${API_BASE}/api/rain/cards/${invoice.cardId}`);
      const data = await res.json() as { card?: RainCard; error?: string };
      if (data.error) setError(data.error);
      else setRainCard(data.card ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchCard(); }, [invoice.cardId]);

  const scope = invoice.cardScope;
  const expMonth = rainCard?.expirationMonth ?? "••";
  const expYear = rainCard?.expirationYear
    ? String(rainCard.expirationYear).slice(-2)
    : "••";
  const rainLimitUsd = rainCard?.limit?.amount != null ? rainCard.limit.amount / 100 : null;

  return (
    <div>
      {/* ── The card itself ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{
          background: "linear-gradient(135deg, #003d2e 0%, #006b50 55%, #004c3f 100%)",
          minHeight: 190,
        }}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-36 w-36 rounded-full bg-white/5" />

        {/* Top row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-white/60 uppercase">Warden</p>
            <p className="text-[10px] font-medium tracking-wider text-white/40 uppercase">by Rain</p>
          </div>
          <div className="flex items-center gap-2">
            <CardStatusBadge status={rainCard?.status} />
            {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-white/50" />}
          </div>
        </div>

        {/* Chip */}
        <div className="mt-4">
          <ChipSvg />
        </div>

        {/* Card number */}
        <p className="mt-4 font-mono text-[20px] font-semibold tracking-[0.18em] text-white">
          •••• •••• •••• {invoice.last4 ?? "????"}
        </p>

        {/* Bottom row */}
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">Locked to</p>
            <p className="text-[13px] font-semibold tracking-wide text-white uppercase">
              {scope?.merchant ?? invoice.vendorName ?? "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">Expires</p>
            <p className="font-mono text-[13px] font-semibold text-white">
              {expMonth}/{expYear}
            </p>
          </div>
        </div>
      </div>

      {/* ── Data rows below the card ── */}
      <div className="mt-4 space-y-2 rounded-xl border border-border bg-hover p-4">
        <Row label="Card ID">
          <span className="font-mono text-[11px] text-text-sub">{invoice.cardId ?? "—"}</span>
        </Row>

        <Row label="Card type">
          <Badge tone="info">{rainCard?.type ?? "virtual"}</Badge>
        </Row>

        <Row label="Scope limit">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-brand" />
            <span className="tnum text-[13px] font-semibold text-text">
              {usd(scope?.amountLimit ?? invoice.amount)}
            </span>
            <span className="text-[11px] text-text-tertiary">(invoice exact)</span>
          </div>
        </Row>

        {rainLimitUsd != null && (
          <Row label="Rain limit">
            <span className="tnum text-[13px] font-semibold text-text">{usd(rainLimitUsd)}</span>
            <span className="ml-1.5 text-[11px] text-text-tertiary">(1.2× pre-auth buffer)</span>
          </Row>
        )}

        {rainCard?.limit?.frequency && (
          <Row label="Cap type">
            <Badge tone="success">
              {rainCard.limit.frequency === "allTime" ? "Lifetime cap" : rainCard.limit.frequency}
            </Badge>
          </Row>
        )}

        <Row label="Single use">
          <Badge tone="success">Yes</Badge>
        </Row>

        {scope?.expiresAt && (
          <Row label="TTL">
            <span className="text-[13px] text-text-sub">
              {expiresIn(scope.expiresAt)} remaining
            </span>
          </Row>
        )}

        {rainCard?.status && (
          <Row label="Rain status">
            {rainCard.status === "canceled" || rainCard.status === "cancelled" ? (
              <Badge tone="success">Canceled — single payment done</Badge>
            ) : rainCard.status === "active" ? (
              <Badge tone="info">Active — cancellation pending</Badge>
            ) : (
              <Badge tone="neutral">{rainCard.status}</Badge>
            )}
          </Row>
        )}
      </div>

      {/* Refresh + error */}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void fetchCard()}
          disabled={loading}
          className="flex items-center gap-1.5 text-[12px] text-brand hover:underline disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh Rain status
        </button>
        {error && <span className="text-[11px] text-critical">{error}</span>}
      </div>

      {/* Monad link */}
      {invoice.txHash && (
        <a
          href={explorerTxUrl(invoice.txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
        >
          View payment on Monad
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-[12px] text-text-sub">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </div>
  );
}

function DecisionStepper({ invoice }: { invoice: InvoiceRecord }) {
  return (
    <ol className="space-y-0">
      {invoice.events.map((event, i) => {
        const meta = EVENT_LABEL[event.type];
        const failed = !event.ok;
        const isEscalation = event.type === "escalated";
        const isLast = i === invoice.events.length - 1;

        const dot = failed
          ? isEscalation
            ? "border-attention bg-attention-bg text-[#7E4B00]"
            : "border-critical bg-critical-bg text-critical"
          : "border-brand bg-brand-bg text-brand";

        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && <span className="absolute top-6 left-[11px] h-full w-px bg-border" />}
            <span
              className={`relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${dot}`}
            >
              {failed ? (isEscalation ? "!" : "✕") : "✓"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-text">{meta.label}</span>
                <span className="tnum text-xs text-text-tertiary">{clockTime(event.ts)}</span>
              </div>
              {event.reason && (
                <p
                  className={`mt-0.5 text-xs ${
                    failed ? (isEscalation ? "text-[#7E4B00]" : "text-critical") : "text-text-sub"
                  }`}
                >
                  {event.reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function InvoiceDetail({ invoice, busy, onClose, onApprove, onReject }: Props) {
  const status = STATUS_TONE[invoice.status];
  const needsDecision = invoice.status === "awaiting_approval";
  const isBlocked = invoice.status === "blocked";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        className="animate-panel flex h-full w-full max-w-[540px] flex-col bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Invoice ${invoice.invoiceId}`}
      >
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-text">{invoice.invoiceId}</h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-text-sub">
              {invoice.vendorName}
              {invoice.poRef ? ` · ${invoice.poRef}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-text-sub transition-colors hover:bg-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {(needsDecision || isBlocked) && (
            <div
              className={`rounded-lg border p-4 ${
                needsDecision ? "border-attention bg-attention-bg" : "border-critical bg-critical-bg"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-4 w-4 ${needsDecision ? "text-[#B26100]" : "text-critical"}`}
                />
                <h3
                  className={`text-[13px] font-semibold ${
                    needsDecision ? "text-[#7E4B00]" : "text-critical"
                  }`}
                >
                  Card never issued
                </h3>
              </div>
              <p className="mt-2 text-[13px] text-text">{invoice.reason ?? "Failed policy check."}</p>

              {needsDecision && (
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => onApprove(invoice.invoiceId)}>
                    <Check className="h-3.5 w-3.5" />
                    {busy ? "Approving…" : "Approve"}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => onReject(invoice.invoiceId)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {invoice.status === "paid" && <VirtualCardPanel invoice={invoice} />}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-text-sub uppercase">
              Line Items
            </h3>
            <table className="w-full text-[13px]">
              <tbody>
                {(invoice.lineItems ?? []).map((item, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-2 text-text">{item.description}</td>
                    <td className="tnum py-2 text-right text-text-sub">{usd(item.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2.5 text-[13px] font-semibold text-text">Total</td>
                  <td className="tnum pt-2.5 text-right text-[13px] font-semibold text-text">
                    {usd(invoice.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-3 text-[11px] font-semibold tracking-wide text-text-sub uppercase">
              Agent Decision Log
            </h3>
            <DecisionStepper invoice={invoice} />
          </section>

          {invoice.txHash && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-text-sub uppercase">
                On-Chain Settlement
              </h3>
              <MonoPill href={explorerTxUrl(invoice.txHash)}>{invoice.txHash}</MonoPill>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

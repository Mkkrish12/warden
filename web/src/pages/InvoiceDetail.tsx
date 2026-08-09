import { AlertTriangle, Check, CreditCard, ExternalLink, Lock, X } from "lucide-react";
import type { InvoiceRecord } from "@warden/shared";
import { Badge, Button, MonoPill } from "../components/ui";
import { EVENT_LABEL, STATUS_TONE, clockTime, expiresIn, explorerTxUrl, usd } from "../lib/format";

interface Props {
  invoice: InvoiceRecord;
  busy: boolean;
  onClose: () => void;
  onApprove: (invoiceId: string) => void;
  onReject: (invoiceId: string) => void;
}

function ScopedCardPanel({ invoice }: { invoice: InvoiceRecord }) {
  const scope = invoice.cardScope;

  return (
    <div className="rounded-lg border border-brand bg-brand-bg p-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-brand" />
        <span className="text-[11px] font-semibold tracking-wide text-brand uppercase">
          Virtual Card
        </span>
      </div>

      <p className="tnum mt-3 font-mono text-2xl font-semibold text-text">
        •••• {invoice.last4 ?? "————"}
      </p>

      <dl className="mt-4 space-y-2 text-[13px]">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-brand" />
          <dt className="text-text-sub">Locked to:</dt>
          <dd className="font-medium text-text">{scope?.merchant ?? invoice.vendorName}</dd>
        </div>
        <div className="flex items-center gap-2 pl-[22px]">
          <dt className="text-text-sub">Limit:</dt>
          <dd className="tnum font-medium text-text">{usd(scope?.amountLimit ?? invoice.amount)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-text-sub">
        Single use · Expires {scope ? `in ${expiresIn(scope.expiresAt)}` : "24h"}
      </p>

      {invoice.txHash && (
        <a
          href={explorerTxUrl(invoice.txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
        >
          View on Monad
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
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
        className="animate-panel flex h-full w-full max-w-[520px] flex-col bg-surface shadow-xl"
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
                needsDecision
                  ? "border-attention bg-attention-bg"
                  : "border-critical bg-critical-bg"
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

          {invoice.status === "paid" && <ScopedCardPanel invoice={invoice} />}

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
                Settlement
              </h3>
              <MonoPill href={explorerTxUrl(invoice.txHash)}>{invoice.txHash}</MonoPill>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

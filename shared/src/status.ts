import type { AgentEvent } from "./events.js";

/** Where an invoice currently stands, derived purely from its event stream. */
export type InvoiceStatus = "pending" | "paid" | "blocked" | "awaiting_approval";

/** Everything the surfaces need to render one invoice's row and detail panes. */
export interface InvoiceRecord {
  invoiceId: string;
  vendorId?: string;
  vendorName?: string;
  amount?: number;
  poRef?: string;
  lineItems?: { description: string; amount: number }[];
  status: InvoiceStatus;
  reason?: string;
  cardId?: string;
  last4?: string;
  cardScope?: {
    merchant: string;
    amountLimit: number;
    expiresAt: string;
    singleUse: true;
  };
  txHash?: string;
  events: AgentEvent[];
}

/**
 * Fold an invoice's events into a single record.
 *
 * Order matters: `reconciled` (paid) is terminal and wins over any earlier
 * escalation, because an invoice that was escalated and then approved has in
 * fact been paid. Kept in @warden/shared so the agent API and the dashboard can
 * never disagree about what "paid" means.
 */
export function deriveInvoiceRecord(invoiceId: string, events: AgentEvent[]): InvoiceRecord {
  const record: InvoiceRecord = { invoiceId, status: "pending", events };

  for (const event of events) {
    const data = event.data ?? {};

    if (typeof data.vendorName === "string") record.vendorName = data.vendorName;
    if (typeof data.vendorId === "string") record.vendorId = data.vendorId;
    if (typeof data.amount === "number") record.amount = data.amount;
    if (typeof data.poRef === "string") record.poRef = data.poRef;
    if (Array.isArray(data.lineItems)) {
      record.lineItems = data.lineItems as InvoiceRecord["lineItems"];
    }
    if (typeof data.last4 === "string") record.last4 = data.last4;
    if (typeof data.cardId === "string") record.cardId = data.cardId;
    if (data.scope && typeof data.scope === "object") {
      record.cardScope = data.scope as InvoiceRecord["cardScope"];
    }

    switch (event.type) {
      case "reconciled":
        if (event.ok) {
          record.status = "paid";
          record.reason = undefined;
          if (typeof data.txHash === "string") record.txHash = data.txHash;
        } else {
          record.status = "blocked";
          record.reason = event.reason;
        }
        break;

      case "escalated":
        // Don't re-open an invoice that has already settled.
        if (record.status !== "paid") {
          record.status = "awaiting_approval";
          record.reason = event.reason;
        }
        break;

      case "blocked":
        if (record.status !== "paid") {
          record.status = "blocked";
          record.reason = event.reason;
        }
        break;

      case "policy_checked":
        if (!event.ok) record.reason = event.reason;
        break;

      default:
        break;
    }
  }

  return record;
}

/** Group a flat event stream into per-invoice records, newest activity last. */
export function deriveInvoiceRecords(events: AgentEvent[]): InvoiceRecord[] {
  const byInvoice = new Map<string, AgentEvent[]>();
  for (const event of events) {
    const list = byInvoice.get(event.invoiceId);
    if (list) list.push(event);
    else byInvoice.set(event.invoiceId, [event]);
  }
  return [...byInvoice.entries()].map(([id, evts]) => deriveInvoiceRecord(id, evts));
}

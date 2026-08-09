import type { AgentEvent, Invoice } from "@warden/shared";
import type { EventBus } from "./events/eventBus.js";
import type { PolicyClient } from "./policy/policyClient.js";
import type { PaymentProvider, ScopedCardResult } from "./payments/PaymentProvider.js";
import { toUsdc6 } from "./policy/money.js";
import type { BlockedMode } from "./config.js";

export interface OrchestratorDeps {
  bus: EventBus;
  policy: PolicyClient;
  payments: PaymentProvider;
  /** "escalate" sends policy failures to a human; "block" auto-rejects them. */
  blockedMode?: BlockedMode;
  /** Pause between invoices in processInbox so the demo reads at human speed. */
  stepDelayMs?: number;
  /** Write an on-chain audit record when an invoice is blocked/escalated. */
  logBlockedOnChain?: boolean;
}

export type InvoiceOutcome = "paid" | "blocked" | "escalated" | "failed";

export interface ProcessResult {
  invoiceId: string;
  outcome: InvoiceOutcome;
  reason?: string;
  txHash?: string;
  card?: ScopedCardResult;
}

/** An invoice parked awaiting a human decision in Slack. */
export interface PendingApproval {
  invoice: Invoice;
  reason: string;
  since: number;
}

/**
 * The reason a human cannot override. Everything else (unknown vendor, over cap)
 * is a policy judgement a person is allowed to make; paying twice is never one.
 */
const REASON_ALREADY_PAID = "invoice already paid";

export interface Orchestrator {
  processInvoice(invoice: Invoice): Promise<ProcessResult>;
  processInbox(invoices: Invoice[]): Promise<ProcessResult[]>;
  resumeWithApproval(invoiceId: string, approver?: string): Promise<ProcessResult>;
  rejectPending(invoiceId: string, approver?: string): Promise<ProcessResult>;
  pending(): PendingApproval[];
  getPending(invoiceId: string): PendingApproval | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const { bus, policy, payments } = deps;
  const blockedMode: BlockedMode = deps.blockedMode ?? "escalate";
  const stepDelayMs = deps.stepDelayMs ?? 600;
  const logBlockedOnChain = deps.logBlockedOnChain ?? true;

  /** Invoices awaiting a human tap in Slack, keyed by invoiceId. */
  const awaitingApproval = new Map<string, PendingApproval>();

  function emit(
    invoice: Pick<Invoice, "invoiceId">,
    type: AgentEvent["type"],
    ok: boolean,
    reason?: string,
    data?: Record<string, unknown>,
  ): AgentEvent {
    return bus.emit({ invoiceId: invoice.invoiceId, type, ok, reason, data });
  }

  function invoiceContext(invoice: Invoice) {
    return {
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorName,
      amount: invoice.amount,
      currency: invoice.currency,
      poRef: invoice.poRef,
    };
  }

  /**
   * Mint the scoped card, settle it, then record the payment on-chain.
   * Shared by the automatic path and the human-approved resume path so both
   * produce an identical event sequence.
   */
  async function mintSettleAndReconcile(invoice: Invoice): Promise<ProcessResult> {
    // Last line of defence before money moves. markPaid would revert on a repeat,
    // but that happens *after* the card is minted — by then real funds have already
    // been committed. Never mint against an invoice already in the registry.
    if (await policy.isPaid(invoice.invoiceId)) {
      const reason = "invoice already paid — refusing to mint a second card";
      emit(invoice, "blocked", false, reason);
      return { invoiceId: invoice.invoiceId, outcome: "blocked", reason };
    }

    let card: ScopedCardResult;
    try {
      card = await payments.mintScopedCardAndSettle(invoice);
    } catch (err) {
      const reason = `card issuance failed: ${(err as Error).message}`;
      emit(invoice, "blocked", false, reason);
      return { invoiceId: invoice.invoiceId, outcome: "failed", reason };
    }

    emit(invoice, "card_minted", true, `scoped card issued via ${payments.name}`, {
      provider: payments.name,
      cardId: card.cardId,
      last4: card.last4,
      scope: card.scope,
    });

    if (card.txStatus !== "settled") {
      const reason = "card settlement failed";
      emit(invoice, "settled", false, reason, { cardId: card.cardId });
      return { invoiceId: invoice.invoiceId, outcome: "failed", reason, card };
    }

    emit(invoice, "settled", true, `settled ${invoice.currency} ${invoice.amount.toFixed(2)}`, {
      cardId: card.cardId,
      last4: card.last4,
      amount: invoice.amount,
    });

    // Registry write is what makes double-payment impossible, so a failure here
    // is reported loudly rather than swallowed: the money moved but the ledger
    // didn't record it, and a human needs to know.
    try {
      const { txHash, blockNumber } = await policy.markPaid(invoice);
      emit(invoice, "reconciled", true, "recorded on Monad", {
        txHash,
        blockNumber,
        explorerUrl: policy.explorerTxUrl(txHash),
        cardId: card.cardId,
      });
      return { invoiceId: invoice.invoiceId, outcome: "paid", txHash, card };
    } catch (err) {
      const reason = `settled but on-chain reconciliation failed: ${(err as Error).message}`;
      emit(invoice, "reconciled", false, reason, { cardId: card.cardId });
      return { invoiceId: invoice.invoiceId, outcome: "failed", reason, card };
    }
  }

  async function recordBlockedOnChain(invoice: Invoice, reason: string): Promise<void> {
    if (!logBlockedOnChain) return;
    try {
      const { txHash, blockNumber } = await policy.logBlocked(invoice.invoiceId, reason);
      emit(invoice, "blocked", false, reason, {
        auditTxHash: txHash,
        blockNumber,
        explorerUrl: policy.explorerTxUrl(txHash),
      });
    } catch (err) {
      // The audit log is best-effort; failing to write it must not change the
      // decision, which has already been made and emitted.
      emit(invoice, "blocked", false, reason, {
        auditLogError: (err as Error).message,
      });
    }
  }

  async function processInvoice(invoice: Invoice): Promise<ProcessResult> {
    emit(invoice, "parsed", true, `invoice parsed for ${invoice.vendorName}`, {
      ...invoiceContext(invoice),
      // Full line items so surfaces can render the invoice detail without
      // re-reading the source file.
      lineItems: invoice.lineItems,
      lineItemCount: invoice.lineItems.length,
      amountUsdc6: toUsdc6(invoice.amount).toString(),
    });

    let decision: { ok: boolean; reason?: string };
    try {
      decision = await policy.checkPayable(invoice);
    } catch (err) {
      const reason = `policy check failed: ${(err as Error).message}`;
      emit(invoice, "policy_checked", false, reason);
      return { invoiceId: invoice.invoiceId, outcome: "failed", reason };
    }

    if (decision.ok) {
      emit(invoice, "policy_checked", true, "within policy", invoiceContext(invoice));
      return mintSettleAndReconcile(invoice);
    }

    const reason = decision.reason ?? "policy check failed";
    emit(invoice, "policy_checked", false, reason, invoiceContext(invoice));

    // Already-paid is terminal: never escalate something a human could approve
    // into a double payment.
    if (blockedMode === "escalate" && reason !== REASON_ALREADY_PAID) {
      awaitingApproval.set(invoice.invoiceId, { invoice, reason, since: Date.now() });
      emit(invoice, "escalated", false, reason, {
        ...invoiceContext(invoice),
        awaitingApproval: true,
      });
      return { invoiceId: invoice.invoiceId, outcome: "escalated", reason };
    }

    await recordBlockedOnChain(invoice, reason);
    return { invoiceId: invoice.invoiceId, outcome: "blocked", reason };
  }

  /**
   * Human approved an escalation in Slack — force the payment through.
   *
   * The contract re-checks policy inside markPaid, so an over-cap or unapproved
   * invoice would revert there even after a human says yes. To honour the approval
   * we raise that vendor's cap just far enough to cover this invoice, pay, then
   * restore the previous cap. Both cap writes emit VendorSet on-chain, so the
   * exception is auditable rather than silent, and policy is unchanged afterwards.
   */
  async function resumeWithApproval(invoiceId: string, approver = "human"): Promise<ProcessResult> {
    const entry = awaitingApproval.get(invoiceId);
    if (!entry) {
      throw new Error(`No invoice awaiting approval with id ${invoiceId}`);
    }
    const { invoice } = entry;
    awaitingApproval.delete(invoiceId);

    emit(invoice, "approved", true, `approved by ${approver}`, {
      ...invoiceContext(invoice),
      approver,
      originalReason: entry.reason,
    });

    // Re-read policy: state may have moved since the escalation was raised.
    const decision = await policy.checkPayable(invoice);

    if (decision.ok) {
      return mintSettleAndReconcile(invoice);
    }

    if (decision.reason === REASON_ALREADY_PAID) {
      const reason = "cannot approve: invoice was already paid";
      emit(invoice, "blocked", false, reason);
      return { invoiceId, outcome: "blocked", reason };
    }

    // Grant a temporary, logged exception for this one invoice.
    const previousCap = await policy.getVendorCap(invoice.vendorId);
    const neededCap = toUsdc6(invoice.amount);

    emit(invoice, "approved", true, `policy exception granted by ${approver}`, {
      approver,
      originalReason: decision.reason,
      previousCap: previousCap.toString(),
      temporaryCap: neededCap.toString(),
    });

    const override = await policy.setVendorCap(invoice.vendorId, neededCap);
    emit(invoice, "approved", true, "vendor cap temporarily raised for approved exception", {
      txHash: override.txHash,
      blockNumber: override.blockNumber,
      explorerUrl: policy.explorerTxUrl(override.txHash),
    });

    try {
      return await mintSettleAndReconcile(invoice);
    } finally {
      // Always put policy back, even if payment failed — a raised cap must never
      // outlive the single invoice it was granted for.
      try {
        if (previousCap > 0n) {
          const restore = await policy.setVendorCap(invoice.vendorId, previousCap);
          emit(invoice, "approved", true, "vendor cap restored", {
            txHash: restore.txHash,
            blockNumber: restore.blockNumber,
          });
        }
        // A previously-unapproved vendor (cap 0) can't be restored via setVendor,
        // which rejects a zero cap by design. Flag it for a human to clean up.
        else {
          emit(
            invoice,
            "approved",
            false,
            `vendor ${invoice.vendorId} was not previously approved and now has a cap of ` +
              `${neededCap.toString()} — remove it with removeVendor if that was a one-off`,
            { vendorId: invoice.vendorId, temporaryCap: neededCap.toString() },
          );
        }
      } catch (err) {
        emit(invoice, "approved", false, `FAILED to restore vendor cap: ${(err as Error).message}`, {
          vendorId: invoice.vendorId,
          previousCap: previousCap.toString(),
        });
      }
    }
  }

  async function rejectPending(invoiceId: string, approver = "human"): Promise<ProcessResult> {
    const entry = awaitingApproval.get(invoiceId);
    if (!entry) {
      throw new Error(`No invoice awaiting approval with id ${invoiceId}`);
    }
    awaitingApproval.delete(invoiceId);

    const reason = `rejected by ${approver}: ${entry.reason}`;
    await recordBlockedOnChain(entry.invoice, reason);
    return { invoiceId, outcome: "blocked", reason };
  }

  async function processInbox(invoices: Invoice[]): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    for (const [i, invoice] of invoices.entries()) {
      results.push(await processInvoice(invoice));
      if (i < invoices.length - 1 && stepDelayMs > 0) await sleep(stepDelayMs);
    }
    return results;
  }

  return {
    processInvoice,
    processInbox,
    resumeWithApproval,
    rejectPending,
    pending: () => [...awaitingApproval.values()],
    getPending: (invoiceId: string) => awaitingApproval.get(invoiceId),
  };
}

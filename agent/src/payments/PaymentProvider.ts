import type { Invoice } from "@warden/shared";

/**
 * The scope a virtual card is locked to. This is the hero of the product: one
 * merchant, one exact amount, single use, short expiry. Nothing here is advisory —
 * the card issuer enforces it.
 */
export interface CardScope {
  merchant: string;
  /** Exact invoice amount in USD. Not a ceiling the agent chose — the invoice total. */
  amountLimit: number;
  /** ISO-8601 expiry, 24h out. */
  expiresAt: string;
  singleUse: true;
}

export interface ScopedCardResult {
  cardId: string;
  last4: string;
  scope: CardScope;
  txStatus: "settled" | "failed";
  /** Present when `txStatus` is `"failed"` — safe to show in the UI. */
  failureReason?: string;
}

/**
 * Issues a scoped virtual card for one invoice and settles it.
 *
 * Implementations must never issue a card that isn't locked to the invoice's
 * vendor and exact amount. Swappable so the Rain client can replace the stub
 * without the orchestrator changing.
 */
export interface PaymentProvider {
  readonly name: string;
  mintScopedCardAndSettle(invoice: Invoice): Promise<ScopedCardResult>;
}

/** Card lifetime for every scoped card Warden mints. */
export const CARD_TTL_HOURS = 24;

export function expiryFromNow(hours = CARD_TTL_HOURS, now = Date.now()): string {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

/** Build the scope for an invoice. Shared by every provider so the rules can't drift. */
export function scopeForInvoice(invoice: Invoice): CardScope {
  return {
    merchant: invoice.vendorName,
    amountLimit: invoice.amount,
    expiresAt: expiryFromNow(),
    singleUse: true,
  };
}

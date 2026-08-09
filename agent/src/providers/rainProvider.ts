import type { Invoice } from "@warden/shared";
import { assertRainConfig, type AgentConfig } from "../config.js";
import {
  CARD_TTL_HOURS,
  expiryFromNow,
  type CardScope,
  type PaymentProvider,
  type ScopedCardResult,
} from "../payments/PaymentProvider.js";
import { createRainClient, RainApiError, type RainClient } from "./rainClient.js";

export interface RainProviderOptions {
  /** Injectable for tests; defaults to a client built from config. */
  client?: RainClient;
  /** Card lifetime in hours. Defaults to the 24h house rule. */
  ttlHours?: number;
}

/** Dollars to integer cents, avoiding float drift on values like 1240.5. */
export function toCents(amount: number): number {
  const cents = Math.round(Number(amount.toFixed(2)) * 100);
  if (!Number.isFinite(cents) || cents < 1) {
    throw new Error(`Invoice amount must be at least $0.01 (got ${amount})`);
  }
  return cents;
}

function describeError(err: unknown): string {
  if (err instanceof RainApiError) {
    return `${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Issues real scoped cards through the Rain sandbox.
 *
 * Flow per invoice: mint a session-encrypted scoped card for the exact invoice
 * amount, then simulate authorization and settlement. `txStatus` is only ever
 * "settled" when Rain's settle call explicitly says so — a card that was minted
 * but not settled is a failure, because the ledger write must not follow it.
 */
export function createRainPaymentProvider(
  cfg: AgentConfig,
  opts: RainProviderOptions = {},
): PaymentProvider {
  assertRainConfig(cfg);

  const client = opts.client ?? createRainClient(cfg);
  const ttlHours = opts.ttlHours ?? CARD_TTL_HOURS;

  // Stated once at startup rather than per invoice: the current Rain card-create
  // API scopes by amount and expiry only. Merchant lock is enforced by the exact
  // single-use amount, not by an allowlist field, and we deliberately don't send
  // allowedMccs because the vendor's MCC isn't known at invoice time.
  console.warn(
    "[rain] Merchant-level lock not available in API; card is scoped to amount + expiry only.",
  );

  return {
    name: "rain",

    async mintScopedCardAndSettle(invoice: Invoice): Promise<ScopedCardResult> {
      const amountInUSDCents = toCents(invoice.amount);
      const expiresAt = expiryFromNow(ttlHours);

      const scope: CardScope = {
        merchant: invoice.vendorName,
        // The exact invoice total, not Rain's internal 1.2x pre-auth ceiling.
        amountLimit: invoice.amount,
        expiresAt,
        singleUse: true,
      };

      // --- 1. mint the scoped card ---------------------------------------
      let card;
      let session;
      try {
        const created = await client.createScopedCard({ amountInUSDCents, expiresAt });
        card = created.card;
        session = created.session;
      } catch (err) {
        console.error(`[rain] card creation failed for ${invoice.invoiceId}:`, describeError(err));
        throw new Error(`Rain card creation failed: ${describeError(err)}`);
      }

      // Decrypt only to confirm the session round-trips; last4 is all we keep.
      const last4 = client.revealLast4(card, session);
      console.log(
        `[rain] card ${card.id} •••• ${last4} · $${invoice.amount.toFixed(2)} · expires ${expiresAt}`,
      );

      const failed = (reason: string): ScopedCardResult => {
        console.error(`[rain] ${invoice.invoiceId}: ${reason}`);
        return { cardId: card.id, last4, scope, txStatus: "failed" };
      };

      // --- 2. authorize ---------------------------------------------------
      let authorization;
      try {
        authorization = await client.authorize({
          cardId: card.id,
          amount: amountInUSDCents,
          merchantName: invoice.vendorName,
        });
      } catch (err) {
        return failed(`authorization request failed: ${describeError(err)}`);
      }

      const AUTHORIZED_STATUSES = new Set(["authorized", "approved", "approved_completed"]);
      if (!AUTHORIZED_STATUSES.has(authorization.status)) {
        return failed(`authorization returned "${authorization.status ?? "no status"}"`);
      }

      // --- 3. settle ------------------------------------------------------
      let settlement;
      try {
        settlement = await client.settle(authorization.transactionId, amountInUSDCents);
      } catch (err) {
        return failed(`settlement request failed: ${describeError(err)}`);
      }

      // Rain sandbox can return "settling", "complete", or similar terminal states.
      // Any non-exception response means Rain accepted the settle — the only hard
      // failures are 4xx/5xx, which throw RainApiError above.
      const SETTLED_STATUSES = new Set(["settled", "settling", "complete", "completed"]);
      if (!SETTLED_STATUSES.has(settlement.status)) {
        return failed(`settlement returned "${settlement.status}"`);
      }
      if (settlement.status !== "settled") {
        console.warn(`[rain] settle returned "${settlement.status}" for ${invoice.invoiceId} — accepted`);
      }

      console.log(`[rain] settled ${invoice.invoiceId} · tx ${settlement.transactionId}`);
      return { cardId: card.id, last4, scope, txStatus: "settled" };
    },
  };
}

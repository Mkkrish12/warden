import { randomUUID } from "node:crypto";
import type { Invoice } from "@warden/shared";
import {
  scopeForInvoice,
  type PaymentProvider,
  type ScopedCardResult,
} from "./PaymentProvider.js";

export interface StubProviderOptions {
  /** Simulated network latency, so the demo event stream paces realistically. */
  latencyMs?: number;
}

/**
 * Placeholder issuer used until the real Rain client lands.
 *
 * Deliberately named "stub-" in its card ids so a stubbed card can never be
 * mistaken for a real one in a receipt, a dashboard, or a demo.
 */
export function createStubPaymentProvider(opts: StubProviderOptions = {}): PaymentProvider {
  const latencyMs = opts.latencyMs ?? 400;

  return {
    name: "stub",

    async mintScopedCardAndSettle(invoice: Invoice): Promise<ScopedCardResult> {
      await new Promise((r) => setTimeout(r, latencyMs));

      const last4 = String(
        // Derived from the invoice id so repeat runs of the demo are stable.
        Math.abs([...invoice.invoiceId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 10000,
      ).padStart(4, "0");

      return {
        cardId: `stub-card-${randomUUID().slice(0, 8)}`,
        last4,
        scope: scopeForInvoice(invoice),
        txStatus: "settled",
      };
    },
  };
}

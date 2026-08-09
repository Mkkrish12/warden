import { randomUUID } from "node:crypto";
import type { AgentConfig } from "../config.js";
import { createRainSession, decryptSecret, type RainSession } from "./rainSession.js";

export interface RainCard {
  id: string;
  last4: string;
  status?: string;
  type?: string;
  userId?: string;
  expirationMonth?: number | string;
  expirationYear?: number | string;
  /** Rain applies a 1.2x pre-auth buffer; `frequency: allTime` makes it a lifetime cap. */
  limit?: { amount: number; frequency?: string };
  encryptedPan?: { data: string; iv: string } | string;
  encryptedCvc?: { data: string; iv: string } | string;
}

export interface RainAuthorization {
  transactionId: string;
  status: string;
}

/** Thrown with the response body attached so failures are diagnosable. */
export class RainApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "RainApiError";
  }
}

export interface CreateScopedCardInput {
  amountInUSDCents: number;
  expiresAt: string;
}

export interface RainClient {
  createScopedCard(
    input: CreateScopedCardInput,
  ): Promise<{ card: RainCard; session: RainSession }>;
  authorize(input: {
    cardId: string;
    amount: number;
    merchantName: string;
    merchantCategoryCode?: string;
  }): Promise<RainAuthorization>;
  /**
   * @param amountInUSDCents required by the live sandbox — it rejects an empty
   *   body with "body must have required property 'amount'", despite the docs
   *   describing `{}` as settling the full authorized amount.
   */
  settle(transactionId: string, amountInUSDCents: number): Promise<RainAuthorization>;
  /** Fetch a card's current state from Rain — status, limit, expiry. */
  getCard(cardId: string): Promise<RainCard>;
  revealLast4(card: RainCard, session: RainSession): string;
}

export function createRainClient(cfg: AgentConfig): RainClient {
  const { apiKey, baseUrl, userId } = cfg.rain;

  async function request<T>(
    path: string,
    init: { method: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      // Leave as text — a non-JSON body is itself useful diagnostic output.
    }

    if (!res.ok) {
      throw new RainApiError(
        `Rain ${init.method} ${path} failed with ${res.status}: ${
          typeof parsed === "string" ? parsed : JSON.stringify(parsed)
        }`,
        res.status,
        parsed,
      );
    }

    return parsed as T;
  }

  /** Rain nests payloads under `data` on some endpoints; accept either shape. */
  function unwrap<T>(body: unknown): T {
    if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  return {
    async createScopedCard(input) {
      // Fresh session per card: it's the key Rain encrypts the PAN/CVC under.
      const session = createRainSession();

      const body = await request<unknown>(`/issuing/users/${userId}/cards/scoped`, {
        method: "POST",
        headers: {
          sessionid: session.sessionId,
          // Guards against a retry minting a second card for the same payment.
          "Idempotency-Key": randomUUID(),
        },
        body: {
          amountInUSDCents: input.amountInUSDCents,
          expiresAt: input.expiresAt,
        },
      });

      return { card: unwrap<RainCard>(body), session };
    },

    async authorize({ cardId, amount, merchantName, merchantCategoryCode = "5065" }) {
      const body = await request<unknown>(`/simulate/transactions/authorize`, {
        method: "POST",
        body: {
          cardId,
          amount,
          currency: "USD",
          merchantName,
          merchantCategoryCode,
        },
      });
      return unwrap<RainAuthorization>(body);
    },

    async settle(transactionId, amountInUSDCents) {
      const body = await request<unknown>(
        `/simulate/transactions/${transactionId}/settle`,
        { method: "POST", body: { amount: amountInUSDCents } },
      );
      return unwrap<RainAuthorization>(body);
    },

    async getCard(cardId) {
      const body = await request<unknown>(`/issuing/cards/${cardId}`, { method: "GET" });
      return unwrap<RainCard>(body);
    },

    /**
     * Decrypts the PAN purely to confirm the session key round-trips, and returns
     * only the last 4. Full PAN and CVC are never returned, logged, or stored.
     */
    revealLast4(card, session) {
      const pan = card.encryptedPan;
      if (!pan || typeof pan === "string" || !pan.data || !pan.iv) {
        return card.last4 ?? "";
      }
      try {
        const decrypted = decryptSecret(pan.data, pan.iv, session.secretKey);
        return decrypted.slice(-4);
      } catch {
        // Never let a decryption problem fail a payment that Rain accepted.
        return card.last4 ?? "";
      }
    },
  };
}

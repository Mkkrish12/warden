import type { AgentEventType, InvoiceStatus } from "@warden/shared";

export const EXPLORER_BASE = "https://testnet.monadexplorer.com";
export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAddressUrl = (addr: string) => `${EXPLORER_BASE}/address/${addr}`;

export const usd = (amount?: number) =>
  amount === undefined
    ? "—"
    : amount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      });

/** Compact form for stat tiles, where the cents are noise. */
export const usdCompact = (amount: number) =>
  amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export const clockTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

export const dateShort = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const shortHash = (hash?: string) =>
  hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : "—";

export function expiresIn(iso?: string): string {
  if (!iso) return "24h";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export type BadgeTone = "success" | "warning" | "critical" | "attention" | "neutral" | "info";

/** One mapping from status to badge tone, so colour never drifts between pages. */
export const STATUS_TONE: Record<InvoiceStatus, { tone: BadgeTone; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  awaiting_approval: { tone: "attention", label: "Escalated" },
  blocked: { tone: "critical", label: "Blocked" },
  pending: { tone: "warning", label: "Pending" },
};

export const EVENT_LABEL: Record<AgentEventType, { label: string; tone: BadgeTone }> = {
  parsed: { label: "Parsed", tone: "neutral" },
  policy_checked: { label: "Policy", tone: "info" },
  card_minted: { label: "Card minted", tone: "success" },
  settled: { label: "Settled", tone: "success" },
  reconciled: { label: "Reconciled", tone: "success" },
  blocked: { label: "Blocked", tone: "critical" },
  escalated: { label: "Escalated", tone: "attention" },
  approved: { label: "Approved", tone: "info" },
};

/** On-chain transaction kinds, derived from the agent event that carried the hash. */
export type TxType = "InvoicePaid" | "InvoiceBlocked" | "VendorSet";

export const TX_TONE: Record<TxType, BadgeTone> = {
  InvoicePaid: "success",
  InvoiceBlocked: "critical",
  VendorSet: "info",
};

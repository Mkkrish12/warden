/**
 * Lifecycle events emitted by the agent as it processes an invoice.
 * This structured stream is the backbone every surface (Slack, web) consumes.
 */
export type AgentEventType = "parsed" | "policy_checked" | "card_minted" | "settled" | "reconciled" | "blocked" | "escalated" | "approved";
export interface AgentEvent {
    id: string;
    invoiceId: string;
    type: AgentEventType;
    ok: boolean;
    reason?: string;
    data?: Record<string, unknown>;
    ts: number;
}

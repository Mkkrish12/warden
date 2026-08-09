import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveInvoiceRecords, type AgentEvent, type InvoiceRecord } from "@warden/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3002";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "error";

export interface AgentMeta {
  policyAddress?: string;
  chainId?: number;
  cardIssuer?: string;
  blockedMode?: string;
}

export interface AgentStream {
  events: AgentEvent[];
  invoices: InvoiceRecord[];
  connection: ConnectionState;
  meta: AgentMeta;
  approve(invoiceId: string): Promise<{ ok: boolean; error?: string }>;
  reject(invoiceId: string): Promise<{ ok: boolean; error?: string }>;
  busy: Set<string>;
}

/**
 * Subscribes to the agent's SSE stream.
 *
 * The server replays history on connect, so events are deduped by id — a
 * reconnect must not double the log.
 */
export function useAgentStream(): AgentStream {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [meta, setMeta] = useState<AgentMeta>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setMeta({
            policyAddress: d.policyAddress,
            chainId: d.chainId,
            cardIssuer: d.cardIssuer,
            blockedMode: d.blockedMode,
          });
        }
      })
      .catch(() => undefined);

    const source = new EventSource(`${API_BASE}/api/events`);
    source.onopen = () => setConnection("live");

    source.addEventListener("agent", (raw) => {
      const event = JSON.parse((raw as MessageEvent).data) as AgentEvent;
      if (seen.current.has(event.id)) return;
      seen.current.add(event.id);
      setEvents((prev) => [...prev, event]);
    });

    source.onerror = () => {
      setConnection((c) => (c === "live" ? "reconnecting" : "error"));
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  const act = useCallback(async (invoiceId: string, action: "approve" | "reject") => {
    setBusy((prev) => new Set(prev).add(invoiceId));
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approver: "dashboard" }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok && body.ok !== false, error: body.error };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
    }
  }, []);

  const invoices = useMemo(() => deriveInvoiceRecords(events), [events]);

  return {
    events,
    invoices,
    connection,
    meta,
    busy,
    approve: (id) => act(id, "approve"),
    reject: (id) => act(id, "reject"),
  };
}

export { API_BASE };

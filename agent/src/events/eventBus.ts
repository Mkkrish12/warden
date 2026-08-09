import { randomUUID } from "node:crypto";
import type { AgentEvent, AgentEventType } from "@warden/shared";

export type AgentEventListener = (event: AgentEvent) => void;

/** Everything about an event except the bits the bus fills in (id, ts). */
export type EmitInput = Omit<AgentEvent, "id" | "ts"> & { id?: string; ts?: number };

export interface EventBus {
  emit(input: EmitInput): AgentEvent;
  on(listener: AgentEventListener): () => void;
  /** Replay buffer — lets a dashboard that connects late still render the run. */
  history(): AgentEvent[];
  /** Async iterator of future events; SSE-friendly. Pass a signal to stop. */
  subscribe(opts?: { signal?: AbortSignal; replay?: boolean }): AsyncIterableIterator<AgentEvent>;
  close(): void;
}

export interface EventBusOptions {
  /** Max events retained for replay. Oldest are dropped past this. */
  historyLimit?: number;
}

export function createEventBus(opts: EventBusOptions = {}): EventBus {
  const historyLimit = opts.historyLimit ?? 500;

  const listeners = new Set<AgentEventListener>();
  const past: AgentEvent[] = [];
  let closed = false;

  function emit(input: EmitInput): AgentEvent {
    const event: AgentEvent = {
      ...input,
      id: input.id ?? randomUUID(),
      ts: input.ts ?? Date.now(),
    };

    past.push(event);
    if (past.length > historyLimit) past.shift();

    // Copy first: a listener that unsubscribes itself must not mutate the set
    // we're iterating.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (err) {
        console.error("[eventBus] listener threw:", err);
      }
    }
    return event;
  }

  function on(listener: AgentEventListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function subscribe(
    subOpts: { signal?: AbortSignal; replay?: boolean } = {},
  ): AsyncIterableIterator<AgentEvent> {
    // Buffer events that arrive while the consumer is busy, so a slow consumer
    // (a browser on a bad connection) drops nothing.
    const queue: AgentEvent[] = subOpts.replay ? [...past] : [];
    let pending: ((r: IteratorResult<AgentEvent>) => void) | null = null;
    let done = false;

    const unsubscribe = on((event) => {
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ value: event, done: false });
      } else {
        queue.push(event);
      }
    });

    function finish() {
      if (done) return;
      done = true;
      unsubscribe();
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ value: undefined as never, done: true });
      }
    }

    subOpts.signal?.addEventListener("abort", finish, { once: true });
    closers.add(finish);

    const iterator: AsyncIterableIterator<AgentEvent> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async next(): Promise<IteratorResult<AgentEvent>> {
        const buffered = queue.shift();
        if (buffered) return { value: buffered, done: false };
        if (done || closed) return { value: undefined as never, done: true };
        return new Promise((resolve) => {
          pending = resolve;
        });
      },
      async return(): Promise<IteratorResult<AgentEvent>> {
        finish();
        closers.delete(finish);
        return { value: undefined as never, done: true };
      },
    };

    return iterator;
  }

  const closers = new Set<() => void>();

  return {
    emit,
    on,
    history: () => [...past],
    subscribe,
    close() {
      closed = true;
      for (const finish of [...closers]) finish();
      closers.clear();
      listeners.clear();
    },
  };
}

/** Render an event as a single readable console line. */
export function formatEvent(event: AgentEvent): string {
  const time = new Date(event.ts).toISOString().slice(11, 19);
  const status = event.ok ? "ok " : "ERR";
  const label = (event.type as AgentEventType).padEnd(14);
  const reason = event.reason ? ` — ${event.reason}` : "";
  return `${time} ${status} ${label} ${event.invoiceId}${reason}`;
}

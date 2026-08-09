import express from "express";
import cors from "cors";
import { deriveInvoiceRecords, type AgentEvent } from "@warden/shared";
import type { Agent } from "../createAgent.js";
import type { ProcessResult } from "../orchestrator.js";

export interface ApiServerOptions {
  port?: number;
  /** Process the inbox automatically once the first dashboard connects. */
  autoRunOnConnect?: boolean;
}

export interface ApiServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Process the inbox, tracked so /api/health and /api/run stay consistent. */
  run(): Promise<{ started: boolean; results: ProcessResult[] }>;
  readonly port: number;
}

/**
 * Serves the agent's event stream to the web dashboard.
 *
 * The bus is the single source of truth: `/api/events` replays history then
 * streams live, so a dashboard opened mid-run still renders the whole story.
 */
export function createApiServer(agent: Agent, opts: ApiServerOptions = {}): ApiServer {
  const port = opts.port ?? Number(process.env.WEB_API_PORT ?? 3002);
  const app = express();
  app.use(cors());
  app.use(express.json());

  let running = false;
  let hasRun = false;

  /**
   * Invoices whose approve/reject has been claimed. Checked and set synchronously
   * before any await, so a double-click can't mint two cards — same guarantee the
   * Slack surface makes.
   */
  const claimed = new Set<string>();

  async function runInbox(): Promise<{ started: boolean; results: ProcessResult[] }> {
    if (running) return { started: false, results: [] };
    running = true;
    try {
      const invoices = await agent.loadInvoices();
      const results = await agent.orchestrator.processInbox(invoices);
      hasRun = true;
      return { started: true, results };
    } finally {
      running = false;
    }
  }

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      policyAddress: agent.config.monad.policyAddress,
      chainId: agent.config.monad.chainId,
      cardIssuer: agent.payments.name,
      blockedMode: agent.config.blockedMode,
      hasRun,
      running,
    });
  });

  /** Snapshot of everything so far — used for the initial paint. */
  app.get("/api/state", (_req, res) => {
    const events = agent.bus.history();
    res.json({
      events,
      invoices: deriveInvoiceRecords(events),
      pending: agent.orchestrator.pending().map((p) => p.invoice.invoiceId),
      running,
      hasRun,
    });
  });

  app.post("/api/run", async (_req, res) => {
    if (running) {
      res.status(409).json({ ok: false, error: "a run is already in progress" });
      return;
    }
    // Respond immediately; progress arrives over SSE.
    void runInbox().catch((err) => console.error("[api] inbox run failed:", err));
    res.json({ ok: true });
  });

  /**
   * Human approval from the dashboard. Mirrors the Slack "Approve once" button —
   * same orchestrator call, same guardrails (already-paid invoices are refused
   * before any card is minted).
   */
  app.post("/api/invoices/:invoiceId/approve", async (req, res) => {
    const { invoiceId } = req.params;
    const approver = typeof req.body?.approver === "string" ? req.body.approver : "dashboard";

    if (claimed.has(invoiceId)) {
      res.status(409).json({ ok: false, error: "already being processed" });
      return;
    }
    claimed.add(invoiceId);

    try {
      const result = await agent.orchestrator.resumeWithApproval(invoiceId, approver);
      res.json({ ok: result.outcome === "paid", result });
    } catch (err) {
      claimed.delete(invoiceId);
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post("/api/invoices/:invoiceId/reject", async (req, res) => {
    const { invoiceId } = req.params;
    const approver = typeof req.body?.approver === "string" ? req.body.approver : "dashboard";

    if (claimed.has(invoiceId)) {
      res.status(409).json({ ok: false, error: "already being processed" });
      return;
    }
    claimed.add(invoiceId);

    try {
      const result = await agent.orchestrator.rejectPending(invoiceId, approver);
      res.json({ ok: true, result });
    } catch (err) {
      claimed.delete(invoiceId);
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get("/api/events", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events aren't held back.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const send = (event: AgentEvent) => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: agent\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Comment line keeps intermediaries from closing an idle connection.
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

    const controller = new AbortController();
    req.on("close", () => {
      clearInterval(heartbeat);
      controller.abort();
    });

    if (opts.autoRunOnConnect && !hasRun && !running) {
      void runInbox().catch((err) => console.error("[api] inbox run failed:", err));
    }

    try {
      // replay: true means a late-joining dashboard still gets the full run.
      for await (const event of agent.bus.subscribe({ signal: controller.signal, replay: true })) {
        send(event);
      }
    } catch (err) {
      if (!controller.signal.aborted) console.error("[api] SSE stream error:", err);
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });

  let server: import("node:http").Server | undefined;

  return {
    port,
    run: runInbox,
    start() {
      return new Promise<void>((resolve) => {
        server = app.listen(port, () => resolve());
      });
    },
    stop() {
      return new Promise<void>((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
      });
    },
  };
}

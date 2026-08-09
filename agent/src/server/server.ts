import express from "express";
import cors from "cors";
import { createPublicClient, http, parseAbiItem } from "viem";
import { deriveInvoiceRecords, type AgentEvent } from "@warden/shared";
import type { Agent } from "../createAgent.js";
import type { ProcessResult } from "../orchestrator.js";
import { createRainClient } from "../providers/rainClient.js";
import { apPolicyAbi } from "../policy/abi.js";
import { hashId, createMonadChain } from "../policy/policyClient.js";

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

  /** Short cache so opening the Cards tab doesn't hammer Rain on every render. */
  const RAIN_CACHE_MS = 10_000;
  let rainCardCache: { at: number; payload: unknown } | null = null;

  /** Cache Monad log queries — getLogs is slow on a public RPC. */
  const TX_CACHE_MS = 15_000;
  let txCache: { at: number; payload: unknown } | null = null;

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

  /**
   * Live card state straight from Rain, joined to the invoice each card paid.
   *
   * This is the proof view: Rain reports `status: canceled` once a card's single
   * payment settles, and its limit carries `frequency: allTime`. Fetched live
   * rather than from the event log so it's Rain's word, not ours.
   */
  app.get("/api/rain/cards", async (req, res) => {
    if (agent.payments.name !== "rain") {
      res.json({ issuer: agent.payments.name, live: false, cards: [] });
      return;
    }

    const now = Date.now();
    const forceRefresh = req.query.refresh === "1";
    if (!forceRefresh && rainCardCache && now - rainCardCache.at < RAIN_CACHE_MS) {
      res.json(rainCardCache.payload);
      return;
    }

    // One row per minted card, oldest first.
    const minted = agent.bus
      .history()
      .filter((e) => e.type === "card_minted" && typeof e.data?.cardId === "string");

    const client = createRainClient(agent.config);
    const records = deriveInvoiceRecords(agent.bus.history());

    const cards = await Promise.all(
      minted.map(async (event) => {
        const cardId = event.data!.cardId as string;
        const invoice = records.find((r) => r.invoiceId === event.invoiceId);

        const base = {
          cardId,
          invoiceId: event.invoiceId,
          vendorName: invoice?.vendorName ?? null,
          invoiceAmount: invoice?.amount ?? null,
          last4: (event.data!.last4 as string) ?? null,
          mintedAt: event.ts,
          scope: event.data!.scope ?? null,
        };

        try {
          const card = await client.getCard(cardId);
          return {
            ...base,
            rain: {
              status: card.status ?? null,
              limitCents: card.limit?.amount ?? null,
              limitFrequency: card.limit?.frequency ?? null,
              expirationMonth: card.expirationMonth ?? null,
              expirationYear: card.expirationYear ?? null,
              type: card.type ?? null,
            },
            error: null,
          };
        } catch (err) {
          return { ...base, rain: null, error: (err as Error).message };
        }
      }),
    );

    const payload = { issuer: "rain", live: true, cards };
    rainCardCache = { at: now, payload };
    res.json(payload);
  });

  /**
   * On-chain transaction history pulled directly from Monad.
   * Reads InvoicePaid and InvoiceBlocked logs from the APPolicy contract,
   * then joins with the invoice file data (for vendor names) and the bus
   * history (for Rain card last4). Survives agent restarts — Monad is the
   * source of truth, not the in-memory bus.
   */
  app.get("/api/transactions", async (_req, res) => {
    const now = Date.now();
    if (txCache && now - txCache.at < TX_CACHE_MS) {
      res.json(txCache.payload);
      return;
    }

    const { rpcUrl, policyAddress } = agent.config.monad;
    if (!rpcUrl || !policyAddress) {
      res.json({ rows: [], error: "Monad not configured" });
      return;
    }

    try {
      const chain = createMonadChain(agent.config);
      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

      const latestBlock = await publicClient.getBlockNumber();
      // Monad public RPC: eth_getLogs limited to a 100-block range.
      const LOG_RANGE = 100n;
      // POLICY_DEPLOY_BLOCK pins an exact start; otherwise last ~2k blocks (~33 min).
      const lookback = 2_000n;
      const fromBlock = process.env.POLICY_DEPLOY_BLOCK
        ? BigInt(process.env.POLICY_DEPLOY_BLOCK)
        : latestBlock > lookback
          ? latestBlock - lookback
          : 0n;

      // Build hash → invoice lookup so on-chain bytes32 ids decode to real strings.
      const invoices = await agent.loadInvoices();
      const invoiceByHash = new Map<string, (typeof invoices)[0]>();
      const vendorNameByHash = new Map<string, string>();
      for (const inv of invoices) {
        invoiceByHash.set(hashId(inv.invoiceId), inv);
        if (!vendorNameByHash.has(hashId(inv.vendorId))) {
          vendorNameByHash.set(hashId(inv.vendorId), inv.vendorName);
        }
      }

      // Rain card data from the in-memory bus (best-effort; empty after restart).
      const cardByInvoiceId = new Map<string, { cardId: string; last4: string }>();
      for (const e of agent.bus.history()) {
        if (e.type === "card_minted" && e.data?.cardId) {
          cardByInvoiceId.set(e.invoiceId, {
            cardId: e.data.cardId as string,
            last4: (e.data.last4 as string) ?? "",
          });
        }
      }

      const addr = policyAddress as `0x${string}`;

      const paidEventAbi = parseAbiItem(
        "event InvoicePaid(bytes32 indexed invoiceId, bytes32 indexed vendorId, uint256 amount, uint256 timestamp)",
      );
      const blockedEventAbi = parseAbiItem(
        "event InvoiceBlocked(bytes32 indexed invoiceId, string reason)",
      );

      async function getLogsChunked(event: typeof paidEventAbi | typeof blockedEventAbi) {
        const out: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
        for (let start = fromBlock; start <= latestBlock; start += LOG_RANGE) {
          const end = start + LOG_RANGE - 1n > latestBlock ? latestBlock : start + LOG_RANGE - 1n;
          const chunk = await publicClient.getLogs({
            address: addr,
            event,
            fromBlock: start,
            toBlock: end,
          });
          out.push(...chunk);
        }
        return out;
      }

      const [paidLogs, blockedLogs] = await Promise.all([
        getLogsChunked(paidEventAbi),
        getLogsChunked(blockedEventAbi),
      ]);

      // Fetch block timestamps for InvoiceBlocked (event has no timestamp field).
      const blockedBlockNums = [...new Set(blockedLogs.map((l) => l.blockNumber!))];
      const blockTsMap = new Map<bigint, number>();
      await Promise.all(
        blockedBlockNums.map(async (bn) => {
          const block = await publicClient.getBlock({ blockNumber: bn });
          blockTsMap.set(bn, Number(block.timestamp) * 1000);
        }),
      );

      type TxRow = {
        txHash: string;
        type: "InvoicePaid" | "InvoiceBlocked";
        invoiceId: string;
        vendorName: string | null;
        amount: number | null;
        block: number;
        ts: number;
        cardId: string | null;
        last4: string | null;
        reason: string | null;
      };

      const rows: TxRow[] = [];

      for (const log of paidLogs) {
        const { invoiceId: invHash, vendorId: vendHash, amount: rawAmount, timestamp } = log.args;
        const invoice = invoiceByHash.get(invHash ?? "");
        const card = invoice ? cardByInvoiceId.get(invoice.invoiceId) : undefined;
        rows.push({
          txHash: log.transactionHash ?? "",
          type: "InvoicePaid",
          invoiceId: invoice?.invoiceId ?? (invHash ?? ""),
          vendorName: invoice?.vendorName ?? vendorNameByHash.get(vendHash ?? "") ?? null,
          amount: invoice?.amount ?? Number(rawAmount ?? 0) / 1_000_000,
          block: Number(log.blockNumber),
          ts: Number(timestamp ?? 0) * 1000,
          cardId: card?.cardId ?? null,
          last4: card?.last4 ?? null,
          reason: null,
        });
      }

      for (const log of blockedLogs) {
        const { invoiceId: invHash, reason } = log.args;
        const invoice = invoiceByHash.get(invHash ?? "");
        rows.push({
          txHash: log.transactionHash ?? "",
          type: "InvoiceBlocked",
          invoiceId: invoice?.invoiceId ?? (invHash ?? ""),
          vendorName: invoice?.vendorName ?? null,
          amount: invoice?.amount ?? null,
          block: Number(log.blockNumber),
          ts: blockTsMap.get(log.blockNumber!) ?? 0,
          cardId: null,
          last4: null,
          reason: reason ?? null,
        });
      }

      rows.sort((a, b) => b.block - a.block);

      const txPayload = { rows, policyAddress, chainId: agent.config.monad.chainId };
      txCache = { at: now, payload: txPayload };
      res.json(txPayload);
    } catch (err) {
      console.error("[api] transactions query failed:", err);
      res.status(500).json({ rows: [], error: (err as Error).message });
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

  // JSON 404 so the dashboard never tries to parse Express's default HTML page.
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
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

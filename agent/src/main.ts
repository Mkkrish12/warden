import { createAgent } from "./createAgent.js";
import { formatEvent } from "./events/eventBus.js";
import { createApiServer } from "./server/server.js";
import { createSlackApp, type SlackSurface } from "./slack/app.js";
import type { AgentEvent } from "@warden/shared";

/**
 * The demo process: ONE agent, every surface attached to it.
 *
 * This has to be a single process. Each surface owns a reference to the same
 * event bus and the same orchestrator, so a Slack approval updates the dashboard
 * and the pending-approval queue is shared. Running the API and Slack as separate
 * processes would give each its own agent — and each would process the inbox,
 * trying to pay every invoice twice.
 */

const ICONS: Record<AgentEvent["type"], string> = {
  parsed: "📄",
  policy_checked: "🔍",
  card_minted: "💳",
  settled: "💸",
  reconciled: "⛓️",
  blocked: "⛔",
  escalated: "🙋",
  approved: "✅",
};

function slackConfigured(cfg: ReturnType<typeof createAgent>["config"]): boolean {
  const s = cfg.slack;
  if (!s.botToken || !s.channelId) return false;
  return s.socketMode ? Boolean(s.appToken) : Boolean(s.signingSecret);
}

async function main(): Promise<void> {
  const agent = createAgent();
  const cfg = agent.config;

  agent.bus.on((e) => console.log(`${ICONS[e.type] ?? "•"}  ${formatEvent(e)}`));

  // --- dashboard API + SSE -------------------------------------------------
  // autoRunOnConnect stays off here: the run is kicked off below (or from the
  // dashboard's Run button), so connecting a second browser can't re-trigger it.
  const api = createApiServer(agent, { autoRunOnConnect: false });
  await api.start();

  // --- Slack ---------------------------------------------------------------
  let slack: SlackSurface | undefined;
  if (slackConfigured(cfg)) {
    slack = createSlackApp(agent);
    await slack.start();
  }

  // --- Rain webhook receiver ----------------------------------------------
  // Not built: the Rain API docs haven't been provided, so there are no real
  // endpoints, field names, or signature scheme to implement against. The
  // stub issuer settles synchronously and needs no webhook. See DEMO.md.

  console.log("");
  console.log("  Warden — all surfaces live");
  console.log("  ─────────────────────────────────────────────");
  console.log(`  dashboard API : http://localhost:${api.port}/api/events`);
  console.log(`  dashboard UI  : http://localhost:5173`);
  console.log(`  slack         : ${slack ? (cfg.slack.socketMode ? "Socket Mode" : `HTTP :${cfg.slack.port}`) : "NOT CONFIGURED (skipped)"}`);
  console.log(`  card issuer   : ${agent.payments.name}${agent.payments.name === "stub" ? "  ⚠️  NOT REAL RAIN" : ""}`);
  console.log(`  policy        : ${cfg.monad.policyAddress}  (chain ${cfg.monad.chainId})`);
  console.log(`  on policy fail: ${cfg.blockedMode}`);
  console.log("  ─────────────────────────────────────────────");
  console.log("");

  if (cfg.monad.chainId !== 10143) {
    console.log(`  ⚠️  chain ${cfg.monad.chainId} is not Monad testnet (10143) — check .env\n`);
  }

  // --- run the inbox -------------------------------------------------------
  // Goes through the API server so /api/health and /api/state report the run
  // accurately, and a stray POST /api/run can't start a second one.
  console.log("Processing inbox…\n");
  const { results } = await api.run();

  console.log("\n─── summary ─────────────────────────────────");
  for (const r of results) {
    console.log(`  ${r.outcome.padEnd(9)} ${r.invoiceId}${r.reason ? ` — ${r.reason}` : ""}`);
  }

  const pending = agent.orchestrator.pending();
  if (pending.length > 0) {
    console.log("\n─── awaiting human approval ─────────────────");
    for (const p of pending) {
      console.log(`  ${p.invoice.invoiceId}  ${p.invoice.vendorName}  — ${p.reason}`);
    }
    console.log(
      slack
        ? "\n  → Approve in Slack. That tap mints the card live."
        : "\n  → Slack is not configured, so these can't be approved. Set the Slack env vars.",
    );
  }

  console.log("\nRunning. Ctrl+C to stop.\n");

  const shutdown = async () => {
    console.log("\nShutting down…");
    await slack?.stop();
    await api.stop();
    agent.bus.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`\n[warden] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

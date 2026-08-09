import { createAgent } from "../createAgent.js";
import { formatEvent } from "../events/eventBus.js";
import { createSlackApp } from "./app.js";

/**
 * Starts the Slack surface, then runs the inbox through the agent.
 *
 * Stays alive after the run so escalated invoices can be approved from Slack —
 * that button tap is what mints the card live.
 */
async function main(): Promise<void> {
  const agent = createAgent();
  const slack = createSlackApp(agent);

  // Mirror the same stream to the console so the terminal is demo-able too.
  agent.bus.on((e) => console.log(`  ${formatEvent(e)}`));

  await slack.start();
  console.log("Warden Slack surface is running");
  console.log(`  mode          : ${agent.config.slack.socketMode ? "Socket Mode" : `HTTP :${agent.config.slack.port}`}`);
  console.log(`  channel       : ${agent.config.slack.channelId}`);
  console.log(`  policy        : ${agent.config.monad.policyAddress}`);
  console.log(`  card issuer   : ${agent.payments.name}`);
  console.log("");

  const invoices = await agent.loadInvoices();
  console.log(`Processing ${invoices.length} invoice(s)…\n`);
  const results = await agent.orchestrator.processInbox(invoices);

  const pending = agent.orchestrator.pending();
  console.log("\n─── summary ─────────────────────────────────");
  for (const r of results) {
    console.log(`  ${r.outcome.padEnd(9)} ${r.invoiceId}${r.reason ? ` — ${r.reason}` : ""}`);
  }

  if (pending.length > 0) {
    console.log(`\n${pending.length} invoice(s) awaiting approval in Slack. Waiting for a human…`);
    console.log("Press Ctrl+C to stop.");
  } else {
    console.log("\nNothing awaiting approval. Still listening — Ctrl+C to stop.");
  }

  const shutdown = async () => {
    console.log("\nShutting down…");
    await slack.stop();
    agent.bus.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`\n[warden/slack] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

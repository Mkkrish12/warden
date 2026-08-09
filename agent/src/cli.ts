import type { AgentEvent } from "@warden/shared";
import { createAgent } from "./createAgent.js";
import { formatEvent } from "./events/eventBus.js";

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

function render(event: AgentEvent): void {
  console.log(`${ICONS[event.type] ?? "•"}  ${formatEvent(event)}`);

  // The scoped card is the whole point — show exactly what it's locked to.
  if (event.type === "card_minted" && event.data?.scope) {
    const scope = event.data.scope as Record<string, unknown>;
    console.log(`      └─ card ••••${event.data.last4} locked to "${scope.merchant}"`);
    console.log(
      `         limit $${Number(scope.amountLimit).toFixed(2)} · single-use · expires ${scope.expiresAt}`,
    );
  }
  if (event.data?.explorerUrl) {
    console.log(`      └─ ${event.data.explorerUrl}`);
  }
}

async function main(): Promise<void> {
  const agent = createAgent();

  console.log("Warden AP agent");
  console.log(`  policy contract : ${agent.config.monad.policyAddress}`);
  console.log(`  chain           : ${agent.config.monad.chainId}`);
  console.log(`  card issuer     : ${agent.payments.name}`);
  console.log(`  on policy fail  : ${agent.config.blockedMode}`);
  console.log("");

  agent.bus.on(render);

  const invoices = await agent.loadInvoices();
  if (invoices.length === 0) {
    console.log(`No invoices found in ${agent.config.invoicesDir}`);
    return;
  }
  console.log(`Processing ${invoices.length} invoice(s) from ${agent.config.invoicesDir}\n`);

  const results = await agent.orchestrator.processInbox(invoices);

  console.log("\n─── summary ─────────────────────────────────");
  for (const r of results) {
    console.log(`  ${r.outcome.padEnd(9)} ${r.invoiceId}${r.reason ? ` — ${r.reason}` : ""}`);
  }

  const pending = agent.orchestrator.pending();
  if (pending.length > 0) {
    console.log("\n─── awaiting human approval ─────────────────");
    for (const p of pending) {
      console.log(`  ${p.invoice.invoiceId} (${p.invoice.vendorName}) — ${p.reason}`);
    }
    console.log("\n  Slack will approve these in Part 4 via resumeWithApproval().");
  }

  agent.bus.close();
}

main().catch((err) => {
  console.error(`\n[warden] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

/**
 * Reclaim Rain sandbox spending power before a demo.
 *
 * Prior settled demo runs and leftover open authorizations burn the company
 * credit line (`GET /issuing/balances` → spendingPower). When it drops below
 * the next invoice amount, authorize returns `declined` with
 * `account_credit_limit_exceeded` and the dashboard shows settlement failed.
 *
 * This script:
 *   1. Cancels every active card
 *   2. Reverses open authorizations / refunds settled spends where the simulate
 *      API allows it
 *   3. Prints the resulting balances
 *
 *   pnpm rain:reclaim
 */
import { loadConfig, isRainConfigured } from "../src/config.js";
import { createRainClient, RainApiError } from "../src/providers/rainClient.js";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!isRainConfigured(cfg)) {
    console.error("Rain is not configured. Set RAIN_API_KEY and RAIN_USER_ID in warden/.env");
    process.exitCode = 1;
    return;
  }

  const client = createRainClient(cfg);

  const before = await client.getBalances();
  console.log("Rain credit reclaim");
  console.log(`  before  spendingPower=${dollars(before.spendingPower)}  posted=${dollars(before.postedCharges)}  pending=${dollars(before.pendingCharges)}`);

  const cards = await client.listCards();
  const active = cards.filter((c) => c.status === "active");
  console.log(`\nCanceling ${active.length} active card(s)…`);
  for (const card of active) {
    try {
      await client.cancelCard(card.id);
      console.log(`  ✓ •••• ${card.last4 ?? card.id.slice(0, 8)} canceled`);
    } catch (err) {
      console.log(`  ✗ ${card.id.slice(0, 8)} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const txs = await client.listTransactions(100);
  console.log(`\nReversing / refunding up to ${txs.length} transaction(s)…`);
  let freed = 0;
  for (const tx of txs) {
    const amount = tx.spend?.amount ?? 0;
    if (amount < 1) continue;
    try {
      await client.reverseAuthorization(tx.id);
      console.log(`  ✓ reverse ${tx.id.slice(0, 8)} ${dollars(amount)}`);
      freed += amount;
      continue;
    } catch {
      /* try refund */
    }
    try {
      await client.refundTransaction(tx.id, amount);
      console.log(`  ✓ refund  ${tx.id.slice(0, 8)} ${dollars(amount)}`);
      freed += amount;
    } catch (err) {
      const msg =
        err instanceof RainApiError
          ? typeof err.body === "object" && err.body && "message" in err.body
            ? String((err.body as { message: string }).message)
            : err.message
          : err instanceof Error
            ? err.message
            : String(err);
      // Declined/closed txs can't be reversed — expected noise.
      if (!/already closed|not yet settled/i.test(msg)) {
        console.log(`  · skip ${tx.id.slice(0, 8)} ${dollars(amount)} (${msg})`);
      }
    }
  }

  const after = await client.getBalances();
  console.log("\n─────────────────────────────────────────────");
  console.log(`  freed (best-effort) : ${dollars(freed)}`);
  console.log(`  spendingPower       : ${dollars(after.spendingPower)}`);
  console.log(`  creditLimit         : ${dollars(after.creditLimit)}`);
  console.log(`  postedCharges       : ${dollars(after.postedCharges)}`);
  console.log(`  pendingCharges      : ${dollars(after.pendingCharges)}`);
  console.log("─────────────────────────────────────────────");

  const demoNeedCents = 145_000 + 78_000 + 320_000 + 92_000; // happy-path total
  if (after.spendingPower < demoNeedCents) {
    console.error(
      `\n⚠ spendingPower ${dollars(after.spendingPower)} is below Run A total ${dollars(demoNeedCents)}.\n` +
        `  Refund remaining settled txs in the Rain dashboard, or ask Rain for a sandbox credit reset.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Enough headroom for Run A (needs ~${dollars(demoNeedCents)}).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

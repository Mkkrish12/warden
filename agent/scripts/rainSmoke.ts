/**
 * Rain sandbox smoke test.
 *
 * Mints one $10 scoped card, authorizes it, and settles it — the exact sequence
 * the agent runs per invoice, isolated so it can be checked against the Rain
 * dashboard before wiring anything else up.
 *
 *   pnpm rain:smoke
 *
 * Exits 0 on success, 1 on any failure.
 */
import { loadConfig, isRainConfigured } from "../src/config.js";
import { createRainClient, RainApiError } from "../src/providers/rainClient.js";
import { expiryFromNow } from "../src/payments/PaymentProvider.js";

const AMOUNT_CENTS = 1000; // $10.00
const MERCHANT = "Warden Smoke Test";

/**
 * Signals a failed smoke run. Deliberately throws rather than calling
 * process.exit(): exiting while an undici socket is still closing crashes the
 * Node process with a libuv assertion and a 127 exit code, which looks like a
 * tooling failure rather than a clean "the API said no".
 */
class SmokeFailure extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "SmokeFailure";
  }
}

function fail(message: string, detail?: unknown): never {
  throw new SmokeFailure(message, detail);
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  console.log("Rain sandbox smoke test");
  console.log(`  base URL : ${cfg.rain.baseUrl}`);
  console.log(`  user id  : ${cfg.rain.userId || "(not set)"}`);
  console.log(`  api key  : ${cfg.rain.apiKey ? `set (${cfg.rain.apiKey.length} chars)` : "(not set)"}`);
  console.log("");

  if (!isRainConfigured(cfg)) {
    fail(
      "Rain is not configured. Add these to warden/.env:\n" +
        "  RAIN_API_KEY=...\n" +
        "  RAIN_USER_ID=...\n" +
        "  RAIN_API_BASE_URL=https://api-dev.raincards.xyz/v1",
    );
  }

  const client = createRainClient(cfg);
  const expiresAt = expiryFromNow(24);

  // --- 1. create the scoped card -------------------------------------------
  console.log(`1/3  Creating scoped card — $10.00, expires ${expiresAt}…`);
  let card, session;
  try {
    const created = await client.createScopedCard({
      amountInUSDCents: AMOUNT_CENTS,
      expiresAt,
    });
    card = created.card;
    session = created.session;
  } catch (err) {
    fail("Card creation failed", err instanceof RainApiError ? err.body : String(err));
  }

  const last4 = client.revealLast4(card, session);
  console.log(`     cardId : ${card.id}`);
  console.log(`     last4  : •••• ${last4}`);
  console.log(`     status : ${card.status ?? "(none reported)"}`);
  if (card.expirationMonth && card.expirationYear) {
    console.log(`     expires: ${card.expirationMonth}/${card.expirationYear}`);
  }

  // --- 2. authorize ---------------------------------------------------------
  console.log(`\n2/3  Simulating authorization for $10.00…`);
  let authorization;
  try {
    authorization = await client.authorize({
      cardId: card.id,
      amount: AMOUNT_CENTS,
      merchantName: MERCHANT,
    });
  } catch (err) {
    fail("Authorization failed", err instanceof RainApiError ? err.body : String(err));
  }

  console.log(`     transactionId : ${authorization.transactionId}`);
  console.log(`     status        : ${authorization.status}`);
  if (authorization.status !== "authorized") {
    fail(`Expected status "authorized", got "${authorization.status}"`);
  }

  // --- 3. settle ------------------------------------------------------------
  console.log(`\n3/3  Simulating settlement…`);
  let settlement;
  try {
    settlement = await client.settle(authorization.transactionId, AMOUNT_CENTS);
  } catch (err) {
    fail("Settlement failed", err instanceof RainApiError ? err.body : String(err));
  }

  console.log(`     status : ${settlement.status}`);
  if (settlement.status !== "settled") {
    fail(`Expected status "settled", got "${settlement.status}"`);
  }

  console.log("\n─────────────────────────────────────────────");
  console.log("  ✓ Rain smoke test passed");
  console.log(`    cardId        : ${card.id}`);
  console.log(`    last4         : •••• ${last4}`);
  console.log(`    transactionId : ${authorization.transactionId}`);
  console.log(`    final status  : ${settlement.status}`);
  console.log("─────────────────────────────────────────────");
  console.log("  Verify this card in the Rain dashboard.\n");
}

main().catch((err) => {
  const isExpected = err instanceof SmokeFailure;
  console.error(`\n✕ ${isExpected ? err.message : "Unexpected error"}`);

  const detail = isExpected ? err.detail : err instanceof Error ? err.stack : String(err);
  if (detail !== undefined) {
    console.error(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }

  // Let Node drain its sockets and exit naturally with this code.
  process.exitCode = 1;
});

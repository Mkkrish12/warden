#!/usr/bin/env node
/**
 * Resets the demo to a clean slate.
 *
 * The payment registry is permanent by design — once an invoice is marked paid
 * it can never be paid again. That's the product's core guarantee, but it also
 * means a rehearsal burns the demo: a second run reports "invoice already paid"
 * for everything. This redeploys APPolicy (fresh registry), re-seeds the demo
 * vendors, and rewrites POLICY_CONTRACT_ADDRESS in .env.
 *
 * Usage:  pnpm demo:reset
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

if (!existsSync(envPath)) {
  console.error("✕ No .env found. Copy .env.example to .env and fill it in first.");
  process.exit(1);
}

const env = readFileSync(envPath, "utf8");
const readVar = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

const rpcUrl = readVar("MONAD_RPC_URL");
const privateKey = readVar("DEPLOYER_PRIVATE_KEY");

if (!rpcUrl || !privateKey) {
  console.error("✕ MONAD_RPC_URL and DEPLOYER_PRIVATE_KEY must be set in .env");
  process.exit(1);
}

console.log(`Redeploying APPolicy to ${rpcUrl} …\n`);

let output;
try {
  output = execFileSync(
    "forge",
    ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", rpcUrl, "--broadcast"],
    {
      cwd: path.join(root, "contracts"),
      encoding: "utf8",
      env: { ...process.env, DEPLOYER_PRIVATE_KEY: privateKey },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
} catch (err) {
  console.error("✕ Deploy failed.\n");
  console.error(err.stdout ?? "");
  console.error(err.stderr ?? "");
  console.error(
    "\nCommon causes:\n" +
      "  • forge not on PATH        → add ~/.foundry/bin\n" +
      "  • no gas                   → fund the deployer at faucet.monad.xyz\n" +
      "  • RPC unreachable          → check MONAD_RPC_URL\n",
  );
  process.exit(1);
}

const address = output.match(/POLICY_CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40})/)?.[1];
if (!address) {
  console.error("✕ Could not find the deployed address in the deploy output.\n");
  console.error(output);
  process.exit(1);
}

const updated = env.match(/^POLICY_CONTRACT_ADDRESS=.*$/m)
  ? env.replace(/^POLICY_CONTRACT_ADDRESS=.*$/m, `POLICY_CONTRACT_ADDRESS=${address}`)
  : `${env.trimEnd()}\nPOLICY_CONTRACT_ADDRESS=${address}\n`;

writeFileSync(envPath, updated);

console.log("✓ Demo reset\n");
console.log(`  POLICY_CONTRACT_ADDRESS=${address}   (written to .env)`);
console.log("  Vendors seeded: acme-corp $2,000 · globex $5,000 · initech $1,000");
console.log("\n  All invoices are unpaid again. Start the demo with:  pnpm demo\n");

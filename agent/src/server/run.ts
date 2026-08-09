import { createAgent } from "../createAgent.js";
import { formatEvent } from "../events/eventBus.js";
import { createApiServer } from "./server.js";

/**
 * Runs the agent's HTTP/SSE API for the web dashboard.
 * Starts the inbox automatically when the first dashboard connects, so the demo
 * is a single command plus opening the page.
 */
async function main(): Promise<void> {
  const agent = createAgent();
  const server = createApiServer(agent, { autoRunOnConnect: true });

  agent.bus.on((e) => console.log(`  ${formatEvent(e)}`));

  await server.start();
  console.log("Warden dashboard API");
  console.log(`  http://localhost:${server.port}/api/events   (SSE stream)`);
  console.log(`  http://localhost:${server.port}/api/state    (snapshot)`);
  console.log(`  policy  : ${agent.config.monad.policyAddress}`);
  console.log(`  issuer  : ${agent.payments.name}`);
  console.log("\nOpen the dashboard (pnpm dev:web) — the run starts on connect.\n");

  const shutdown = async () => {
    await server.stop();
    agent.bus.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`\n[warden/api] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

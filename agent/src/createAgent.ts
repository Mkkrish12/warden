import { loadConfig, isRainConfigured, type AgentConfig } from "./config.js";
import { createRainPaymentProvider } from "./providers/rainProvider.js";
import { createEventBus, type EventBus } from "./events/eventBus.js";
import { createPolicyClient, type PolicyClient } from "./policy/policyClient.js";
import { createStubPaymentProvider } from "./payments/stubProvider.js";
import type { PaymentProvider } from "./payments/PaymentProvider.js";
import { createOrchestrator, type Orchestrator } from "./orchestrator.js";
import { loadInbox } from "./inbox/inboxLoader.js";
import type { Invoice } from "@warden/shared";

export interface Agent {
  config: AgentConfig;
  bus: EventBus;
  policy: PolicyClient;
  payments: PaymentProvider;
  orchestrator: Orchestrator;
  loadInvoices(): Promise<Invoice[]>;
}

export interface CreateAgentOptions {
  config?: AgentConfig;
  /** Swap in the real Rain client here; defaults to the stub issuer. */
  payments?: PaymentProvider;
  policy?: PolicyClient;
  bus?: EventBus;
}

/**
 * Wires the agent together. Every collaborator is injectable so Slack, the web
 * server, and tests can share one instance or substitute their own.
 */
export function createAgent(opts: CreateAgentOptions = {}): Agent {
  const config = opts.config ?? loadConfig();
  const bus = opts.bus ?? createEventBus();
  const policy = opts.policy ?? createPolicyClient(config);

  // Rain when credentials are present, stub otherwise. Every surface reads
  // `payments.name`, so a stubbed card is always labelled as one.
  const payments =
    opts.payments ??
    (isRainConfigured(config) ? createRainPaymentProvider(config) : createStubPaymentProvider());

  if (!opts.payments && !isRainConfigured(config)) {
    console.warn("[warden] RAIN_API_KEY/RAIN_USER_ID not set — using the stub card issuer.");
  }

  const orchestrator = createOrchestrator({
    bus,
    policy,
    payments,
    blockedMode: config.blockedMode,
    stepDelayMs: config.stepDelayMs,
  });

  return {
    config,
    bus,
    policy,
    payments,
    orchestrator,
    async loadInvoices() {
      const { invoices, failures } = await loadInbox(config.invoicesDir);
      for (const failure of failures) {
        console.warn(`[inbox] skipping ${failure.file}: ${failure.error}`);
      }
      return invoices;
    },
  };
}

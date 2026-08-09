import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (…/warden), resolved from this file so it works from src/ or dist/. */
export const REPO_ROOT = path.resolve(here, "../..");

// Config lives in a single .env at the repo root, shared by every package.
dotenv.config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

/** How the orchestrator reacts when an invoice fails the on-chain policy check. */
export type BlockedMode = "block" | "escalate";

export interface AgentConfig {
  invoicesDir: string;
  /** "escalate" routes policy failures to a human (Slack); "block" auto-rejects. */
  blockedMode: BlockedMode;
  /** Pause between invoices in processInbox, so the demo reads at human speed. */
  stepDelayMs: number;
  monad: {
    rpcUrl: string;
    chainId: number;
    policyAddress: string;
    deployerPrivateKey: string;
  };
  rain: {
    apiKey: string;
    baseUrl: string;
    userId: string;
    collateralContractId: string;
    webhookSecret: string;
  };
  slack: {
    botToken: string;
    signingSecret: string;
    appToken: string;
    channelId: string;
    /** Socket Mode needs no public URL — the right default for a venue demo. */
    socketMode: boolean;
    /** Only used when socketMode is false. */
    port: number;
  };
}

function env(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

export function loadConfig(): AgentConfig {
  const blockedMode = env("AGENT_BLOCKED_MODE", "escalate") as BlockedMode;

  return {
    invoicesDir: env("INVOICES_DIR", path.join(REPO_ROOT, "invoices")),
    blockedMode: blockedMode === "block" ? "block" : "escalate",
    stepDelayMs: Number(env("AGENT_STEP_DELAY_MS", "600")),
    monad: {
      rpcUrl: env("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz"),
      chainId: Number(env("MONAD_CHAIN_ID", "10143")),
      policyAddress: env("POLICY_CONTRACT_ADDRESS"),
      deployerPrivateKey: env("DEPLOYER_PRIVATE_KEY"),
    },
    rain: {
      apiKey: env("RAIN_API_KEY"),
      baseUrl: env("RAIN_API_BASE_URL", "https://api-dev.raincards.xyz/v1").replace(/\/+$/, ""),
      userId: env("RAIN_USER_ID"),
      collateralContractId: env("RAIN_COLLATERAL_CONTRACT_ID"),
      webhookSecret: env("RAIN_WEBHOOK_SECRET"),
    },
    slack: {
      botToken: env("SLACK_BOT_TOKEN"),
      signingSecret: env("SLACK_SIGNING_SECRET"),
      appToken: env("SLACK_APP_TOKEN"),
      channelId: env("SLACK_CHANNEL_ID"),
      socketMode: env("SLACK_SOCKET_MODE", "true") !== "false",
      port: Number(env("SLACK_PORT", "3001")),
    },
  };
}

/** True when Rain can actually issue cards; otherwise the stub is used. */
export function isRainConfigured(cfg: AgentConfig): boolean {
  return Boolean(cfg.rain.apiKey && cfg.rain.userId);
}

/** Fail with a precise list rather than a 401 three calls deep. */
export function assertRainConfig(cfg: AgentConfig): void {
  const missing: string[] = [];
  if (!cfg.rain.apiKey) missing.push("RAIN_API_KEY");
  if (!cfg.rain.userId) missing.push("RAIN_USER_ID");
  if (missing.length > 0) {
    throw new Error(`Missing Rain configuration: ${missing.join(", ")}`);
  }
}

/** Validate Slack config up front so the app fails at boot, not on first button tap. */
export function assertSlackConfig(cfg: AgentConfig): void {
  const missing: string[] = [];
  if (!cfg.slack.botToken) missing.push("SLACK_BOT_TOKEN");
  if (!cfg.slack.channelId) missing.push("SLACK_CHANNEL_ID");

  if (cfg.slack.socketMode) {
    // Socket Mode opens an outbound WebSocket authenticated by the app token;
    // there is no inbound HTTP endpoint, so no signing secret is involved.
    if (!cfg.slack.appToken) missing.push("SLACK_APP_TOKEN (required for Socket Mode)");
  } else {
    // HTTP mode receives inbound requests, which must be signature-verified.
    if (!cfg.slack.signingSecret) missing.push("SLACK_SIGNING_SECRET (required for HTTP mode)");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Slack configuration: ${missing.join(", ")}. See agent/src/slack/README.md`);
  }
}

/**
 * Fail fast with an actionable message rather than surfacing a cryptic viem error
 * three calls deep. Read-only use doesn't need a signing key, so it's checked
 * separately by the write path.
 */
export function assertMonadReadConfig(cfg: AgentConfig): void {
  if (!cfg.monad.policyAddress) {
    throw new Error(
      "POLICY_CONTRACT_ADDRESS is not set. Deploy the contract (see contracts/README.md) and add it to .env",
    );
  }
}

export function assertMonadWriteConfig(cfg: AgentConfig): void {
  assertMonadReadConfig(cfg);
  if (!cfg.monad.deployerPrivateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set — required to write to the policy contract");
  }
}

import bolt from "@slack/bolt";
import type { AgentEvent } from "@warden/shared";
import type { Agent } from "../createAgent.js";
import { assertSlackConfig } from "../config.js";
import {
  ACTION_APPROVE,
  ACTION_REJECT,
  approvalBlocks,
  approvalText,
  failureBlocks,
  processingBlocks,
  receiptBlocks,
  receiptText,
  rejectedBlocks,
} from "./blocks.js";

const { App, LogLevel } = bolt;

/** Details accumulated across an invoice's event stream, used to render receipts. */
interface InvoiceState {
  vendorName?: string;
  amount?: number;
  last4?: string;
  cardId?: string;
  approver?: string;
  /** The approval message to update in place, if one was posted. */
  message?: { channel: string; ts: string };
}

export interface SlackSurface {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Underlying Bolt app — exposed so tests can inject synthetic interactions. */
  readonly app: InstanceType<typeof App>;
}

export interface SlackAppOptions {
  /**
   * Extra Bolt App options, merged last. Mainly a test seam: Bolt calls
   * `auth.test` during construction, so harnesses pass `deferInitialization`.
   */
  appOptions?: Record<string, unknown>;
}

export function createSlackApp(agent: Agent, opts: SlackAppOptions = {}): SlackSurface {
  const cfg = agent.config;
  assertSlackConfig(cfg);

  const app = new App({
    token: cfg.slack.botToken,
    // Socket Mode authenticates via the app token over an outbound WebSocket.
    // In HTTP mode Bolt verifies every inbound request against the signing secret.
    ...(cfg.slack.socketMode
      ? { socketMode: true, appToken: cfg.slack.appToken }
      : { signingSecret: cfg.slack.signingSecret }),
    logLevel: LogLevel.WARN,
    ...opts.appOptions,
  });

  const state = new Map<string, InvoiceState>();

  /**
   * Invoices whose buttons have been claimed by a click. Guards against a
   * double-tap minting two cards: the check-and-add below is synchronous, so no
   * second handler can interleave before the id is claimed.
   */
  const claimed = new Set<string>();

  function stateFor(invoiceId: string): InvoiceState {
    let s = state.get(invoiceId);
    if (!s) {
      s = {};
      state.set(invoiceId, s);
    }
    return s;
  }

  async function postReceipt(event: AgentEvent, s: InvoiceState): Promise<void> {
    const txHash = event.data?.txHash as string | undefined;
    const input = {
      vendorName: s.vendorName ?? "vendor",
      amount: s.amount ?? 0,
      last4: s.last4,
      txHash,
      approver: s.approver,
    };

    // If this invoice came through an approval, update that message in place so
    // the thread reads as one decision rather than two disconnected posts.
    if (s.message) {
      await app.client.chat.update({
        channel: s.message.channel,
        ts: s.message.ts,
        text: receiptText(input),
        blocks: receiptBlocks(input),
      });
      return;
    }

    await app.client.chat.postMessage({
      channel: cfg.slack.channelId,
      text: receiptText(input),
      blocks: receiptBlocks(input),
    });
  }

  async function postApproval(event: AgentEvent, s: InvoiceState): Promise<void> {
    const input = {
      invoiceId: event.invoiceId,
      vendorName: s.vendorName ?? (event.data?.vendorName as string) ?? "unknown vendor",
      amount: s.amount ?? (event.data?.amount as number) ?? 0,
      reason: event.reason ?? "failed policy check",
    };

    const res = await app.client.chat.postMessage({
      channel: cfg.slack.channelId,
      text: approvalText(input),
      blocks: approvalBlocks(input),
    });

    if (res.ts) s.message = { channel: cfg.slack.channelId, ts: res.ts };
  }

  /** Mirror the agent's event stream into Slack. */
  async function onAgentEvent(event: AgentEvent): Promise<void> {
    const s = stateFor(event.invoiceId);

    switch (event.type) {
      case "parsed":
        s.vendorName = (event.data?.vendorName as string) ?? s.vendorName;
        s.amount = (event.data?.amount as number) ?? s.amount;
        return;

      case "card_minted":
        s.last4 = (event.data?.last4 as string) ?? s.last4;
        s.cardId = (event.data?.cardId as string) ?? s.cardId;
        return;

      case "escalated":
        await postApproval(event, s);
        return;

      case "reconciled":
        if (event.ok) await postReceipt(event, s);
        else if (s.message) {
          await app.client.chat.update({
            channel: s.message.channel,
            ts: s.message.ts,
            text: `🚨 ${event.invoiceId} — payment did not complete.`,
            blocks: failureBlocks(event.invoiceId, event.reason ?? "unknown error"),
          });
        }
        return;

      default:
        return;
    }
  }

  // Bridge the (synchronous) bus to async Slack calls without dropping errors.
  const unsubscribe = agent.bus.on((event) => {
    void onAgentEvent(event).catch((err) => {
      console.error(`[slack] failed to render ${event.type} for ${event.invoiceId}:`, err);
    });
  });

  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------

  app.action(ACTION_APPROVE, async ({ ack, body, respond }) => {
    // Ack within 3s or Slack shows the user an error, regardless of how long
    // the mint + settle + on-chain write actually takes.
    await ack();

    const action = (body as never as { actions: { value: string }[] }).actions[0];
    const invoiceId = action.value;
    const actor = (body as never as { user: { id: string } }).user.id;

    if (claimed.has(invoiceId)) {
      await respond({
        replace_original: false,
        response_type: "ephemeral",
        text: `⏳ ${invoiceId} is already being processed — no second card will be minted.`,
      });
      return;
    }
    claimed.add(invoiceId);

    const s = stateFor(invoiceId);
    s.approver = actor;

    // Swap the buttons out immediately so the message can't be actioned again.
    if (s.message) {
      await app.client.chat.update({
        channel: s.message.channel,
        ts: s.message.ts,
        text: `⏳ Approving ${invoiceId}…`,
        blocks: processingBlocks(invoiceId, actor),
      });
    }

    try {
      // This is the money moment: mints the scoped card, settles it, writes to Monad.
      // The "reconciled" event it emits updates the message in place to the receipt.
      const result = await agent.orchestrator.resumeWithApproval(invoiceId, actor);

      if (result.outcome !== "paid" && s.message) {
        await app.client.chat.update({
          channel: s.message.channel,
          ts: s.message.ts,
          text: `🚨 ${invoiceId} — payment did not complete.`,
          blocks: failureBlocks(invoiceId, result.reason ?? "payment did not complete"),
        });
      }
    } catch (err) {
      // Release the claim so a genuine failure can be retried by tapping again.
      claimed.delete(invoiceId);
      const reason = err instanceof Error ? err.message : String(err);
      if (s.message) {
        await app.client.chat.update({
          channel: s.message.channel,
          ts: s.message.ts,
          text: `🚨 ${invoiceId} — approval failed.`,
          blocks: failureBlocks(invoiceId, reason),
        });
      }
      console.error(`[slack] approval failed for ${invoiceId}:`, err);
    }
  });

  app.action(ACTION_REJECT, async ({ ack, body, respond }) => {
    await ack();

    const action = (body as never as { actions: { value: string }[] }).actions[0];
    const invoiceId = action.value;
    const actor = (body as never as { user: { id: string } }).user.id;

    if (claimed.has(invoiceId)) {
      await respond({
        replace_original: false,
        response_type: "ephemeral",
        text: `${invoiceId} has already been actioned.`,
      });
      return;
    }
    claimed.add(invoiceId);

    const pending = agent.orchestrator.getPending(invoiceId);
    const reason = pending?.reason ?? "rejected by reviewer";
    const s = stateFor(invoiceId);

    try {
      // Writes the rejection to the on-chain audit trail. No card is ever minted.
      await agent.orchestrator.rejectPending(invoiceId, actor);
    } catch (err) {
      console.error(`[slack] reject failed for ${invoiceId}:`, err);
    }

    if (s.message) {
      await app.client.chat.update({
        channel: s.message.channel,
        ts: s.message.ts,
        text: `❌ Rejected — no payment made.`,
        blocks: rejectedBlocks(invoiceId, actor, reason),
      });
    }
  });

  return {
    app,
    async start() {
      // Socket Mode takes no port — it dials out rather than listening.
      if (cfg.slack.socketMode) await app.start();
      else await app.start(cfg.slack.port);
    },
    async stop() {
      unsubscribe();
      await app.stop();
    },
  };
}

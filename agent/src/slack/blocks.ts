import type { types } from "@slack/bolt";

// Bolt 5 re-exports the block types under a `types` namespace.
type KnownBlock = types.KnownBlock;

export const ACTION_APPROVE = "warden_approve_once";
export const ACTION_REJECT = "warden_reject";

export interface ReceiptInput {
  vendorName: string;
  amount: number;
  last4?: string;
  txHash?: string;
  /** Present when the payment came from a human-approved exception. */
  approver?: string;
}

export interface ApprovalInput {
  invoiceId: string;
  vendorName: string;
  amount: number;
  reason: string;
}

export function explorerTxUrl(txHash: string): string {
  return `https://testnet.monadexplorer.com/tx/${txHash}`;
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Plain-text fallback shown in notifications and by clients that can't render blocks. */
export function receiptText(input: ReceiptInput): string {
  const card = input.last4 ? `, scoped single-use card •••• ${input.last4}, expires 24h` : "";
  return `✅ Paid ${input.vendorName} $${formatUsd(input.amount)}${card}.`;
}

export function receiptBlocks(input: ReceiptInput): KnownBlock[] {
  const card = input.last4
    ? `, scoped single-use card •••• *${input.last4}*, expires 24h`
    : "";
  const link = input.txHash ? ` <${explorerTxUrl(input.txHash)}|View on Monad ↗>` : "";

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ Paid *${input.vendorName}* $${formatUsd(input.amount)}${card}.${link}`,
      },
    },
  ];

  if (input.approver) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Approved by <@${input.approver}> · one-time exception` }],
    });
  }

  return blocks;
}

export function approvalText(input: ApprovalInput): string {
  return (
    `⚠️ Invoice ${input.invoiceId} from ${input.vendorName} for ` +
    `$${formatUsd(input.amount)} — ${input.reason}. Card NOT issued.`
  );
}

export function approvalBlocks(input: ApprovalInput): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `⚠️ Invoice *${input.invoiceId}* from *${input.vendorName}* for ` +
          `*$${formatUsd(input.amount)}* — ${input.reason}. *Card NOT issued.*`,
      },
    },
    {
      type: "actions",
      // Scoping the block id to the invoice keeps concurrent approvals distinct.
      block_id: `warden_actions:${input.invoiceId}`,
      elements: [
        {
          type: "button",
          action_id: ACTION_APPROVE,
          style: "primary",
          text: { type: "plain_text", text: "Approve once", emoji: true },
          value: input.invoiceId,
          confirm: {
            title: { type: "plain_text", text: "Approve this payment?" },
            text: {
              type: "mrkdwn",
              text:
                `This mints a *real* single-use card for *$${formatUsd(input.amount)}* ` +
                `locked to *${input.vendorName}*, settles it, and records it on Monad.`,
            },
            confirm: { type: "plain_text", text: "Approve once" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
        {
          type: "button",
          action_id: ACTION_REJECT,
          style: "danger",
          text: { type: "plain_text", text: "Reject", emoji: true },
          value: input.invoiceId,
        },
      ],
    },
  ];
}

/** Buttons removed so the message can't be actioned twice while work is in flight. */
export function processingBlocks(invoiceId: string, actor: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⏳ Approving *${invoiceId}* — minting scoped card and settling…`,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Requested by <@${actor}>` }],
    },
  ];
}

export function rejectedBlocks(invoiceId: string, actor: string, reason: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `❌ Rejected — no payment made.` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${invoiceId}* · ${reason} · rejected by <@${actor}>` },
      ],
    },
  ];
}

export function failureBlocks(invoiceId: string, reason: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `🚨 *${invoiceId}* — payment did not complete.` },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: reason }] },
  ];
}

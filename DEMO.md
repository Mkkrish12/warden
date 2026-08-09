# Warden — run of show

Two runs, about four minutes. Run A proves the agent pays autonomously. Run B proves it
*refuses* to, and that a human tap is what moves the money.

> ### Nothing here is simulated except the inbox
>
> Cards are **real Rain sandbox cards**, settlement is **real Rain authorization + settlement**,
> and policy reads/writes hit **real Monad testnet (chain 10143)**. Only the invoice inbox is
> synthetic JSON.
>
> Two facts worth saying out loud, both verified against the Rain API and visible on the
> **Cards** tab:
>
> - Every card's limit is a **lifetime** cap (`frequency: allTime`), set to that one invoice.
>   True from the moment the card is minted — this is the claim to lead with.
> - Rain **cancels** each card after its single payment settles (`status: canceled`).
>   This is **asynchronous** — it lands a few minutes later, so cards minted seconds ago still
>   read `active`. Say "Rain cancels it after the payment", not "instantly".
>
> "Single use" is not narrative — Rain enforces it. If the dashboard shows an amber
> **`STUB ISSUER`** badge, Rain credentials are missing; fix that before presenting.

---

## Preflight — do this 20 minutes before

Work top to bottom. Every step has a check you can actually run.

### 1. Toolchain

```bash
forge --version        # if "command not found", add ~/.foundry/bin to PATH
node -v                # >= 20
pnpm -v
```

### 2. Environment

```bash
cd warden
cp .env.example .env    # then fill it in
```

Every variable must be set. **Point at Monad testnet, not a local chain:**

```
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
```

> The agent prints `⚠️ chain <id> is not Monad testnet (10143)` on boot if you get this wrong.
> Look for that line — it's the difference between demoing on Monad and demoing on your laptop.

### 3. Gas

```bash
cast balance $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY) \
  --rpc-url https://testnet-rpc.monad.xyz --ether
```

Needs a non-zero MON balance. Top up at <https://faucet.monad.xyz>. Run A + Run B cost roughly
6–8 transactions; have several MON of headroom.

### 4. Deploy + seed (this is also your reset)

```bash
pnpm demo:reset
```

Redeploys `APPolicy`, seeds the three demo vendors, and writes the new
`POLICY_CONTRACT_ADDRESS` into `.env`. It prints the address — keep it visible.

Verify the policy is live:

```bash
cast call $POLICY_CONTRACT_ADDRESS "approvedVendors(bytes32)(uint256)" \
  $(cast keccak "globex") --rpc-url $MONAD_RPC_URL      # → 5000000000
```

### 5. Slack

- App installed, bot invited to the channel (`/invite @Warden`).
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` set.
- Setup guide: [agent/src/slack/README.md](agent/src/slack/README.md).
- On boot the agent prints `slack : Socket Mode`. If it says **NOT CONFIGURED (skipped)**, Run B
  cannot happen — fix it before you present.

### 6. Rain smoke test

```bash
pnpm rain:smoke
```

Mints one **real** $10 scoped card, authorizes it, settles it, and prints the cardId, last4,
and transactionId. Exits 0 on success. Verify the card in the Rain dashboard.

Requires `RAIN_API_KEY` and `RAIN_USER_ID` in `.env`. If you don't know your user id:

```bash
curl -H "Api-Key: $RAIN_API_KEY" https://api-dev.raincards.xyz/v1/issuing/users
```

**Before every full demo run**, reclaim sandbox credit so authorize doesn't decline:

```bash
pnpm rain:reclaim
```

Prior settled runs consume the company credit line (`spendingPower`). When it drops
below the next invoice, Rain returns `declined` / `account_credit_limit_exceeded`
and the UI used to show **Settled · card settlement failed**. `rain:reclaim`
cancels leftover cards and refunds/reverses simulate txs to restore headroom.
Run A needs roughly **$6,350** of spending power for the four paid invoices.

On boot the agent prints `card issuer : rain`. If it says `stub  ⚠️ NOT REAL RAIN`, the
credentials aren't loading — fix that before presenting.

### 7. Final dry run — then reset

Do a full rehearsal, then **run `pnpm demo:reset` again**. See the box below for why.

---

## 🔴 The one thing that will break your demo

The payment registry is permanent by design — an invoice marked paid can **never** be paid
again. That's the product's core guarantee, and it means:

> **A rehearsal burns the demo.** Run it twice against the same contract and every invoice in
> Run A reports `invoice already paid` and shows as Blocked.

**Always run `pnpm demo:reset` between the rehearsal and the real thing.** It takes ~10 seconds.

---

## Start it

```bash
pnpm demo
```

One command, one process for the agent (SSE + Slack share a single agent instance and event
bus), plus the dashboard on Vite.

| Surface | Where |
| ------- | ----- |
| Dashboard | <http://localhost:5173> |
| Agent API | <http://localhost:3002/api/events> |
| Slack | your channel |

**Screen layout:** dashboard full-screen on the projector, Slack on your laptop (or split
50/50). Have the Monad explorer open in a second browser tab.

The inbox runs automatically on start. Seven supplier invoices for **Evergreen Home Co**, a
Shopify store selling eco-friendly home goods:

| Invoice | Vendor | Amount | Cap | Outcome |
| ------- | ------ | ------ | --- | ------- |
| INV-2026-1001 | Acme Corp — packaging | $1,450.00 | $2,000 | ✅ paid |
| INV-2026-1002 | Acme Corp — packaging reorder | $780.00 | $2,000 | ✅ paid |
| INV-2026-1003 | Globex Industries — raw materials | $3,200.00 | $5,000 | ✅ paid |
| **INV-2026-1004** | **Globex Industries — tooling** | **$6,200.00** | **$5,000** | **🙋 escalated — over cap** |
| INV-2026-1005 | Initech — 3PL fulfillment | $920.00 | $1,000 | ✅ paid |
| INV-2026-1006 | Shadow Vendor LLC | $2,100.00 | — | 🙋 escalated — unknown vendor |
| INV-2026-1007 | Initech — shipping surcharge | $1,350.00 | $1,000 | 🙋 escalated — over cap |

Totals to expect: **Total Paid $6,350 · Pending 3 · Blocked 0**.

---

## Run A — the happy path (~90s)

**Say:** *"This is a Shopify seller's AP inbox. Seven supplier invoices — packaging, raw
materials, fulfillment. Nobody is going to open any of them."*

1. **Start on Dashboard.** Point at the four stat tiles and the Recent Activity feed streaming in.

   **Say:** *"For each invoice the agent reads our policy off a Monad contract — is this vendor
   approved, is the amount under their cap, has this invoice already been paid."*

2. **Click Invoices in the sidebar, then the INV-2026-1001 row.** The detail panel slides in
   showing line items, the decision stepper, and the Virtual Card.

   **Say:** *"When it passes, the agent issues a card scoped to exactly this payment: locked to
   Acme Corp, limit $1,450.00 to the cent, single use, dead in 24 hours."*

   Point at each constraint: **Locked to · Limit · Single use · Expires 24h.**

3. **Switch to Slack.** Four receipts are already posted.

   > ✅ Paid Acme Corp $1,450.00 — scoped single-use card •••• 1928, expires 24h. View on Monad ↗

4. **Click "View on Monad".** The explorer opens the `markPaid` transaction.

   **Say:** *"That's the payment recorded on-chain. This invoice can never be paid twice —
   the contract rejects it."*

5. **Click Transactions in the sidebar.** Every settlement, with real block numbers and
   explorer links.

   **Say:** *"That's the reconciliation, done. No human touched any of it."*

---

## Run B — the guardrail (~2 min) — **this is the one that lands**

**Say:** *"Now the invoice that should scare you."*

1. **On Invoices, click INV-2026-1004** — Globex, **$6,200**, against a **$5,000** cap.

   The decision stepper stops dead after two steps:
   `Parsed → Policy ✕ amount exceeds vendor cap → Escalated`.

2. **Point at the amber banner: "Card never issued."**

   **Say:** *"The agent didn't try and fail. It never minted anything. There is no card in
   existence for this invoice, and no funds moved."*

3. **Switch to Slack.** The escalation is waiting:

   > ⚠️ Invoice INV-2026-1004 from Globex Industries for $6,200.00 — amount exceeds vendor cap.
   > Card NOT issued.   **[Approve once]** **[Reject]**

   > You can also approve from the dashboard's **Approve** button — same orchestrator call, same
   > guardrails. Slack is the better story; the button is your fallback if Slack misbehaves.

   **Say:** *"It escalated to a human instead. This is the only thing the finance team actually
   has to look at."*

4. **Tap "Approve once."** Confirm the dialog (it names the vendor and exact amount).

   **🎤 While it mints, say the line:**

   > ### "The agent never gets a blank check — every payment is a card that can only pay this vendor, this exact amount, then it's dead."

5. **The Slack message rewrites itself in place** — `⏳ Approving…` → the ✅ receipt with the
   card last-4 and the Monad link. The dashboard flips INV-2026-1004 to **Paid** at the same
   moment, and the Virtual Card appears showing the **$6,200.00** limit.

   **Say:** *"One tap. The card was minted, scoped to that exact amount, settled, and written
   to the chain — and the approval is on-chain too, as a one-time exception. The cap is already
   back to $5,000."*

6. **Click the Monad link.** Show the transaction.

### Closing line

**Say:** *"Agents are getting good at agreeing on payments. Nobody built the part where the
money actually moves safely. That's this — the settlement layer. Policy on Monad, scoped cards
from Rain, and a human in the loop only for the exceptions."*

---

## Optional beat

If you have time, tap **Reject** on **INV-2026-1006** (Shadow Vendor LLC, unknown vendor). The
message becomes **❌ Rejected — no payment made**, and the rejection is written on-chain to
`logBlocked` for the audit trail. Good answer to "what if the human says no?"

---

## Failure points and fixes

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Everything in Run A shows **Blocked — invoice already paid** | You already ran the demo against this contract | `pnpm demo:reset`. This is the #1 failure. |
| Boot prints `⚠️ chain 31337 is not Monad testnet` | `.env` still points at local anvil | Set `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`, `MONAD_CHAIN_ID=10143`, then `pnpm demo:reset` |
| Boot prints `slack : NOT CONFIGURED (skipped)` | Missing Slack env vars | Set `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`. Run B needs these. |
| Buttons do nothing | Bot not in the channel, or interactivity off | `/invite @Warden`; check Socket Mode + interactivity are enabled |
| `POLICY_CONTRACT_ADDRESS is not set` | Never deployed | `pnpm demo:reset` |
| Deploy fails, no gas | Deployer unfunded | <https://faucet.monad.xyz> |
| `forge: command not found` | Foundry not on PATH | Add `~/.foundry/bin` (Windows: `C:\Users\<you>\.foundry\bin`) |
| Dashboard stuck on **Connecting** | Agent process not up | Check the `[agent]` pane; confirm <http://localhost:3002/api/health> |
| Dashboard **Disconnected** mid-demo | Agent crashed | Restart `pnpm demo` — the dashboard replays the full run from history on reconnect |
| Approve tapped twice | — | Not a problem. Verified: two concurrent taps mint exactly one card. |
| Card minted but invoice shows failed / Blocked | Authorize declined (often `account_credit_limit_exceeded`) | `pnpm rain:reclaim`, confirm spendingPower ≥ ~$6,350, then retry. Check `[rain]` logs for `declinedReason`. |
| Authorize always `declined` after a few successful runs | Sandbox credit exhausted by prior settles | `pnpm rain:reclaim`. If still low, refund in Rain dashboard or ask Rain for a credit reset. |
| Dashboard shows amber **STUB ISSUER** | Rain credentials not loaded | Set `RAIN_API_KEY` + `RAIN_USER_ID`, restart, confirm `pnpm rain:smoke` passes |
| Rain 401 `Invalid api key` | Bad/expired key | Re-check `RAIN_API_KEY`; `pnpm rain:smoke` prints the full error body |
| Card minted but invoice shows failed | Settlement didn't return `settled` | By design — the agent never writes `markPaid` unless Rain confirms settlement. Check the `[rain]` log line for the reason. |
| Port 5173/3002 in use | Old process — **it may be a stale agent using the stub issuer** | Kill it. A stale process on 3002 will silently serve old data and mint stub cards. |
| Amounts look wrong on screen | Wrong vendor caps seeded | `cast call $POLICY_CONTRACT_ADDRESS "approvedVendors(bytes32)(uint256)" $(cast keccak "globex")` → `5000000000` |

### If Slack dies mid-demo

The dashboard is a complete fallback: open the invoice and use its **Approve** button. Same
orchestrator call, same guardrails, same live mint — you lose the Slack visual, not the story.

### If the RPC is flaky

Monad testnet occasionally lags. `markPaid` waits for a receipt, so a slow block looks like a
pause, not a failure. If it times out, the event log shows `reconciled ✕` with the reason —
re-tap Approve; the claim is released on genuine failure and the contract prevents a double pay.

---

## Cheat sheet

```bash
pnpm demo:reset     # fresh contract + seeded vendors + .env updated  ← between every run
pnpm demo           # agent (SSE + Slack) + dashboard
pnpm contracts:test # 23 tests, if someone asks about the contract
```

| Vendor | Cap |
| ------ | --- |
| acme-corp | $2,000 |
| globex | $5,000 |
| initech | $1,000 |

Rejection reasons: `vendor not approved` · `amount exceeds vendor cap` · `invoice already paid`

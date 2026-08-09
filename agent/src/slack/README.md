# Warden — Slack surface

Warden's primary interactive surface. It consumes the agent's `AgentEvent` stream and drives
two flows in one channel:

- **Receipts** — on `reconciled`, posts `✅ Paid {vendor} ${amount} — scoped single-use card
  •••• {last4}, expires 24h.` with a **View on Monad ↗** link to the settlement tx.
- **Approvals** — on `escalated`, posts `⚠️ Invoice … Card NOT issued.` with **[Approve once]**
  and **[Reject]**. Approving mints a real scoped card, settles it, writes `markPaid` to Monad,
  and rewrites the same message in place into the ✅ receipt.

Runs in **Socket Mode** by default, so it needs no public URL at the venue.

## 1. Create the Slack app

Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**, pick your
workspace, and paste this:

```yaml
display_information:
  name: Warden
  description: Autonomous AP agent — scoped card payments with on-chain policy
  background_color: "#1a1d21"
features:
  bot_user:
    display_name: Warden
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - commands
settings:
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
  org_deploy_enabled: false
  token_rotation_enabled: false
```

Notes on the scopes:

| Scope | Why |
| ----- | --- |
| `chat:write` | Post receipts and approval requests, and update them in place. |
| `chat:write.public` | Post to a public channel the bot hasn't been invited to. Drop it if you always `/invite` the bot. |
| `commands` | Required for interactivity (the Approve/Reject buttons). |

With `socket_mode_enabled: true` and `interactivity.is_enabled: true`, Slack delivers button
clicks over the WebSocket — **no request URL is needed**.

## 2. Get the three tokens

1. **`SLACK_APP_TOKEN`** — *Basic Information → App-Level Tokens → Generate*. Add the
   `connections:write` scope. Starts with `xapp-`.
2. **`SLACK_BOT_TOKEN`** — *OAuth & Permissions → Install to Workspace*. Starts with `xoxb-`.
3. **`SLACK_SIGNING_SECRET`** — *Basic Information → App Credentials*.
4. **`SLACK_CHANNEL_ID`** — right-click the channel in Slack → *View channel details* → the ID
   at the bottom (starts with `C`). Then `/invite @Warden` in that channel.

Add all four to the repo-root `.env`:

```
SLACK_BOT_TOKEN=xoxb-…
SLACK_SIGNING_SECRET=…
SLACK_APP_TOKEN=xapp-…
SLACK_CHANNEL_ID=C…
```

## 3. Run

```bash
pnpm slack:run
```

This starts the Slack surface, processes the inbox, and then **stays alive** waiting for button
taps — the approval click is what mints the card live.

## Socket Mode vs HTTP mode

| | Socket Mode (default) | HTTP mode |
| --- | --- | --- |
| Set | `SLACK_SOCKET_MODE=true` (default) | `SLACK_SOCKET_MODE=false` |
| Needs | `SLACK_APP_TOKEN` | `SLACK_SIGNING_SECRET`, a public URL |
| Request URL | none | `https://…/slack/events` |
| Port | n/a | `SLACK_PORT` (default 3001) |

**On signature verification:** in HTTP mode Bolt verifies every inbound request against
`SLACK_SIGNING_SECRET` and rejects anything that fails. Socket Mode has no inbound HTTP
endpoint at all — the connection is an outbound WebSocket authenticated by the app token, so
there are no request signatures to check. Both paths are wired up; `assertSlackConfig()`
enforces whichever secret the selected mode actually requires. Use Socket Mode at the venue.

## Idempotency

A double-tap must never mint two cards. Guards, in order:

1. The buttons are removed from the message the instant a click is claimed (replaced with
   `⏳ Approving…`), so there is nothing left to tap.
2. An in-process `claimed` set is checked and set **synchronously** before any `await`, so two
   near-simultaneous clicks cannot interleave past the guard. The loser gets an ephemeral
   "already being processed" reply and mints nothing.
3. The orchestrator refuses to mint when the invoice is already in the on-chain registry.
4. The contract's `markPaid` reverts on a repeat.

Verified: two `Approve once` clicks fired concurrently produced **exactly one** card.

A genuine failure releases the claim so the reviewer can retry.

## Message reference

| Trigger | Message |
| ------- | ------- |
| `reconciled` (auto) | `✅ Paid Acme Corp $1,240.50, scoped single-use card •••• 3639, expires 24h.` + Monad link |
| `escalated` | `⚠️ Invoice INV-2026-002 from Acme Corp for $4,800.00 — amount exceeds vendor cap. Card NOT issued.` + buttons |
| Approve tapped | `⏳ Approving INV-2026-002 — minting scoped card and settling…` then the ✅ receipt |
| Reject tapped | `❌ Rejected — no payment made.` |
| Payment failed | `🚨 INV-… — payment did not complete.` |

`Approve once` shows a confirmation dialog naming the exact amount and vendor before it moves
money, so a stray tap during a demo can't fire a payment.

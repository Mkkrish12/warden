# Warden — audit dashboard

The reconciliation / audit view. Slack is the daily driver; this is the trustworthy record:
what the agent decided, what it issued, and what landed on-chain.

It's a **read-only** consumer of the agent's `AgentEvent` stream over SSE. Nothing here can
move money — approvals happen in Slack.

## Layout

| Region | Shows |
| ------ | ----- |
| **Left** | Inbox — vendor, amount, status pill (pending / paid / blocked / awaiting approval) |
| **Centre** | Live vertical event log for the selected invoice, newest animating in |
| **Right** | Scoped-card panel on a paid invoice; a red/amber "Card never issued" panel otherwise |
| **Bottom** | Reconciliation ledger — invoice, vendor, amount, status, card ••••, Monad tx link |

## Running it

The dashboard needs the agent's API. From the repo root:

```bash
pnpm demo          # runs the API and the dashboard together
```

or in two terminals:

```bash
pnpm api:run       # agent + SSE on :3002
pnpm dev:web       # dashboard on :5173
```

The inbox run starts automatically when the first dashboard connects. Point the dashboard at a
different API with `VITE_API_BASE`.

### API surface (served by `agent/src/server/server.ts`)

| Route | Purpose |
| ----- | ------- |
| `GET /api/events` | SSE stream. Replays history on connect, then streams live. |
| `GET /api/state` | Snapshot: events, derived invoice records, pending approvals. |
| `GET /api/health` | Policy address, chain id, card issuer, run state. |
| `POST /api/run` | Kick off an inbox run. |

## Design notes

- **Palette.** A near-black ink scale with one blue accent. Colour is reserved for *state*, so
  green/amber/red always mean paid / awaiting a human / blocked — never decoration.
- **Escalation is amber "!", not red "✕".** An escalation isn't a failure; it's a handoff. Only
  a genuine policy rejection reads red.
- **Tabular figures** (`.tnum`) everywhere money appears, so columns align down the ledger.
- **Projector-legible.** Large type, high contrast, three panes that hold at 1024px and up.
  Below that it stacks to a single scrolling column.
- **Motion is meaningful.** New events slide in once; the live indicator pulses. All of it
  respects `prefers-reduced-motion`.
- **The blocked panel is the point.** When an invoice fails policy the right pane says *"Card
  never issued"* and the ledger says *"never issued"* — the guarantee is legible at a glance.

Status is derived from the event stream by `deriveInvoiceRecord` in `@warden/shared`, so the
dashboard and the agent API can never disagree about what "paid" means.

## Issuer badge

The header shows an amber `STUB ISSUER` badge whenever cards are minted by the stub provider
rather than Rain. It disappears once the real Rain client is wired in — so a demo can never
misrepresent a fake card as a real one.

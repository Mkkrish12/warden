# Warden

Autonomous accounts-payable (AP) agent for finance teams. Warden ingests vendor
invoices, decides which are safe to pay under company policy, and pays them
automatically — but every payment is a **Rain scoped virtual card** locked to exactly
one vendor and one exact amount, expiring after 24h and usable once. Company policy
(approved vendors + per-vendor spend caps) lives on-chain in a **Monad** smart contract,
so every decision is enforced and auditable, and no invoice can be paid twice.

## Monorepo layout

```
warden/
  contracts/   # Foundry project — APPolicy.sol (policy + payment registry)
  agent/       # TS agent core, Rain client, Slack bot, event bus
  web/         # Vite + React + Tailwind dashboard
  invoices/    # synthetic invoice JSON (demo inbox)
  shared/      # shared TS types (@warden/shared) imported by agent + web
```

`shared`, `agent`, and `web` are pnpm workspace packages. `contracts` is a Foundry
project; `invoices` is raw JSON.

## Prerequisites

- Node.js >= 20 and pnpm (`npm install -g pnpm`)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`) for contracts

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm build:shared      # emit @warden/shared types
pnpm demo:reset        # deploy APPolicy + seed demo vendors
pnpm demo              # agent (SSE + Slack) + dashboard
```

**Presenting?** → [DEMO.md](DEMO.md) has the click-by-click run of show, the preflight
checklist, and the failure-point table.

> `pnpm demo:reset` redeploys the policy contract and re-seeds vendors. Run it **between every
> demo run** — the payment registry is permanent, so a second run against the same contract
> reports `invoice already paid` for everything.

## Scripts (run from repo root)

| Script                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `pnpm demo`              | **Dashboard demo** — agent API + web, side by side  |
| `pnpm agent:run`         | Run the inbox once, printing the event stream       |
| `pnpm slack:run`         | Slack surface (receipts + approval buttons)         |
| `pnpm api:run`           | Agent HTTP/SSE API for the dashboard (:3002)        |
| `pnpm dev:web`           | Web dashboard only (:5173)                          |
| `pnpm build:shared`      | Build the `@warden/shared` types package            |
| `pnpm build:agent`       | Type-check + compile the agent                      |
| `pnpm build:web`         | Build the web dashboard                             |
| `pnpm typecheck`         | Type-check every workspace package                  |
| `pnpm contracts:build`   | `forge build` the contracts                         |
| `pnpm contracts:test`    | `forge test` the contracts                          |

## Surfaces

| Surface | Role | Docs |
| ------- | ---- | ---- |
| `invoices/` | Ingestion — synthetic invoice JSON | — |
| Slack | Human-in-the-loop + receipts (**primary demo surface**) | [agent/src/slack/README.md](agent/src/slack/README.md) |
| Web | Reconciliation / audit view | [web/README.md](web/README.md) |
| Monad | Policy enforcement + payment registry | [contracts/README.md](contracts/README.md) |

## Environment

All configuration lives in `.env` (see `.env.example`). `.env` is gitignored — never
commit secrets.

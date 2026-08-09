# Warden — `APPolicy` contracts

On-chain accounts-payable policy and payment registry for the Warden agent, deployed to
**Monad testnet (chain 10143)**.

`APPolicy.sol` is the guardrail the agent cannot talk its way around:

- **`approvedVendors`** — per-vendor spend cap, in USDC 6-decimals. A cap of `0` means
  *not approved*, so there is no such thing as an approved vendor with a zero cap.
- **`paid`** — registry of settled invoices. `markPaid` re-runs every policy check and
  reverts on a repeat, which is what makes double-payment impossible.
- **`checkPayable`** — a pure read the agent calls **before** minting any Rain card. It
  returns `(ok, reason)` instead of reverting, so the rejection cause can go straight into
  a Slack escalation.

Vendor and invoice ids are `keccak256` hashes of their string ids (e.g. `keccak256("acme-corp")`).

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation). If `forge` isn't on
  your PATH, add `C:\Users\<you>\.foundry\bin`.
- A funded Monad testnet account — get MON from [faucet.monad.xyz](https://faucet.monad.xyz).
- `MONAD_RPC_URL` and `DEPLOYER_PRIVATE_KEY` set in the repo-root `.env` (see `.env.example`).

Load the env before running any command below:

```bash
set -a && source ../.env && set +a
```

## Build

```bash
forge build
# from the repo root: pnpm contracts:build
```

## Test

```bash
forge test -vv
# from the repo root: pnpm contracts:test
```

Covers approved+under-cap → ok, at-cap boundary, over-cap → reject with reason, unknown and
removed vendors → reject, double `markPaid` → revert, access control, and a fuzz run over
the cap boundary.

## Deploy to Monad testnet

`Deploy.s.sol` deploys **and seeds the three demo vendors in the same broadcast**, so this
one command is all you need:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$MONAD_RPC_URL" \
  --broadcast
```

The script prints the address to copy into your `.env`:

```
=======================================================
  APPolicy deployed
=======================================================
  Network       : Monad testnet (chain 10143)
  Deployer/owner: 0x....

  POLICY_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS

  Explorer: https://testnet.monadexplorer.com/address/0x...
=======================================================
```

Put that value in the repo-root `.env`:

```
POLICY_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS
```

> `foundry.toml` also defines a `monad_testnet` alias, so `--rpc-url monad_testnet` works
> once `MONAD_RPC_URL` is exported.

## Seed vendors (only needed to re-seed / change caps)

`Deploy.s.sol` already seeds on first deploy. To reset caps on an existing deployment
(requires `POLICY_CONTRACT_ADDRESS` in your env):

```bash
forge script script/Seed.s.sol:Seed \
  --rpc-url "$MONAD_RPC_URL" \
  --broadcast
```

Or set a single vendor directly with `cast`:

```bash
cast send "$POLICY_CONTRACT_ADDRESS" \
  "setVendor(bytes32,uint256)" \
  $(cast keccak "acme-corp") 2000000000 \
  --rpc-url "$MONAD_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

### Demo vendors

| Vendor string | Cap (USDC 6dp) | Cap (USD) | `keccak256(vendorId)` |
| ------------- | -------------- | --------- | --------------------- |
| `acme-corp`   | `2000e6`       | $2,000    | `0x5bcf77a43f5c8044935af5c34919f4505459ce1f23ff88cc91d1b3fecc87df46` |
| `globex`      | `5000e6`       | $5,000    | `0x5dfb52708d8428983c6734006c69b58d21243b2668a23d8374097862307c3996` |
| `initech`     | `1000e6`       | $1,000    | `0x635953b6a7b3f5fc6f194aa5a131e71e8da133cbc5ec0244a0383c6495099d8a` |

## Verify a deployment

```bash
# acme-corp's cap -> 2000000000
cast call "$POLICY_CONTRACT_ADDRESS" "approvedVendors(bytes32)(uint256)" \
  $(cast keccak "acme-corp") --rpc-url "$MONAD_RPC_URL"

# happy path: $1,240.50 for acme-corp -> true, ""
cast call "$POLICY_CONTRACT_ADDRESS" "checkPayable(bytes32,bytes32,uint256)(bool,string)" \
  $(cast keccak "acme-corp") $(cast keccak "INV-2026-001") 1240500000 \
  --rpc-url "$MONAD_RPC_URL"

# guardrail: $48,200 for acme-corp -> false, "amount exceeds vendor cap"
cast call "$POLICY_CONTRACT_ADDRESS" "checkPayable(bytes32,bytes32,uint256)(bool,string)" \
  $(cast keccak "acme-corp") $(cast keccak "INV-2026-002") 48200000000 \
  --rpc-url "$MONAD_RPC_URL"
```

## Rejection reasons

`checkPayable` returns these exact strings; `markPaid` reverts with them.

| Reason | Meaning |
| ------ | ------- |
| `vendor not approved` | Vendor has no cap set (or was removed). |
| `amount exceeds vendor cap` | Amount is strictly greater than the cap (the cap itself is payable). |
| `invoice already paid` | Invoice id is already in the registry. |

## Local development

Test against a local chain instead of Monad:

```bash
anvil                                  # terminal 1
# terminal 2 — anvil's first prefunded key
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

# Recon

**Automated stablecoin payment reconciliation for on-chain merchants — built for the HashKey Chain "On-Chain Horizon" hackathon.**

Recon watches a merchant's receiving address for ERC-20 transfers, matches each incoming payment to an open invoice, and closes the loop with a signed webhook — no manual bookkeeping, no trusting a payer's word that "it's on the way."

---

## The problem

Merchants accepting stablecoins on-chain have no equivalent of a payment gateway's reconciliation layer. A transfer lands in a wallet with no invoice reference, no customer metadata, and no notification. Someone has to manually match "0x7f3a... sent 250 USDC at block 30,102,441" back to "Invoice #4821, due from Acme Corp." Recon automates that matching and notifies downstream systems the moment it happens.

## How it works

```
┌─────────────┐      ERC20 Transfer      ┌──────────────┐      HMAC webhook      ┌───────────┐
│ HashKey      │ ───────────────────────▶ │   watcher    │ ─────────────────────▶ │ merchant's │
│ Chain (RPC)  │                          │ (poll+match) │                        │  backend   │
└─────────────┘                          └──────┬───────┘                        └───────────┘
                                                 │
                                     shared SQLite (recon.db)
                                                 │
                                          ┌──────▼───────┐
                                          │  dashboard    │  ← merchant signs in with wallet (SIWE),
                                          │  (Next.js)    │    views invoices/matches, sets webhook
                                          └───────────────┘
```

1. **`contracts/`** — an on-chain `InvoiceRegistry` merchants can (optionally) use to declare an invoice's amount/token/due-date up front, emitting `InvoiceCreated` / `InvoicePaid` events the watcher mirrors.
2. **`watcher/`** — a Node/TypeScript process that polls HashKey Chain for ERC-20 `Transfer` events into any tracked merchant address, then runs a three-tier matcher against open invoices.
3. **`dashboard/`** — a Next.js app where a merchant connects their wallet, creates invoices, watches payments match in real time, reviews low-confidence matches, and configures their webhook endpoint.
4. **`hsp/`** — a vendored HSP (HashKey Stablecoin Payments) SDK workspace plus demo scripts used to simulate an end-to-end payer → invoice → payment flow for testing.

## The matcher: three tiers, cheapest first

| Tier | Rule | Confidence |
|---|---|---|
| **1** | Payment calldata contains the invoice ID as a reference | 1.0 (exact) |
| **2** | Exactly one unmatched payment shares the invoice's (token, amount) | 0.9 |
| **3** | LLM (OpenAI-compatible endpoint) picks the best candidate among invoices within a tolerance band, for payments Tiers 1–2 couldn't resolve | model-reported, gated by a minimum-confidence threshold |

Tier 3 exists because real payments are messy — a customer pays $249.98 against a $250 invoice, or pays without any reference at all. Every Tier 3 payment gets exactly one lifetime attempt; matches below the confidence threshold fall into a merchant-reviewable queue in the dashboard instead of auto-closing.

## Multi-tenant by design

Recon isn't single-merchant: any wallet holder can sign in (SIWE-style message + signature, no password) and onboard as a merchant. The watcher dynamically expands its `Transfer` event filter to every merchant address with open invoices, and every DB query — invoices, matches, webhook settings — is scoped by merchant address. This was audited specifically for cross-tenant leakage (see [Security](#security) below).

## Security

A few things worth calling out for reviewers:

- **Cross-tenant isolation**: Tier 2/3 matching and webhook delivery are scoped per-merchant at the query level (`LOWER(merchant) = LOWER(?)`), stress-tested under a mixed-merchant burst load with payload-level leak assertions (zero cross-tenant deliveries observed).
- **Webhook SSRF guard** (`dashboard/lib/url-safety.ts`): merchant-supplied webhook URLs are rejected if they resolve to loopback, RFC1918/CGNAT, or link-local addresses (including the `169.254.169.254` cloud metadata endpoint), so a malicious merchant can't turn the watcher into an internal-network probe.
- **HMAC-signed webhooks**: every delivery carries `X-Recon-Signature: t=<unix-ts>,v1=<hex-hmac>` (Stripe-style), verified with a constant-time comparison.
- **Session auth**: encrypted `iron-session` cookies, wallet ownership proven via `recoverMessageAddress` over a SIWE-style message — no passwords stored anywhere.

## Project layout

```
contracts/   Foundry project — InvoiceRegistry.sol, MockUSDC.sol, deploy scripts, tests
watcher/     Node/TS poller — chain scanning, matcher tiers, SQLite store, webhook dispatch
dashboard/   Next.js app — wallet sign-in, invoice creation, live match feed, review queue, settings
hsp/         Vendored HSP SDK + demo scripts (create/pay/verify an invoice end-to-end)
```

## Running locally

Requires Node.js 22+ (uses `node:sqlite`, gated behind `--experimental-sqlite`).

### 1. Contracts (optional — testnet addresses already deployed, see `contracts/deployments.json`)

```bash
cd contracts
cp .env.example .env        # fill in a burner deployer key + RPC
forge build
forge test
forge script script/DeployInvoiceRegistry.s.sol --rpc-url $HASHKEY_TESTNET_RPC --broadcast
```

### 2. Watcher

```bash
cd watcher
npm install
cp .env.example .env         # set RPC_URL, RECEIVING_ADDRESS, INVOICE_REGISTRY, etc.
npm run watch                 # or `npm run watch:mainnet` with .env.mainnet
```

### 3. Dashboard

```bash
cd dashboard
npm install
npm run dev                   # http://localhost:3000
```

Sign in with any wallet — signing the SIWE-style message costs no gas. Create an invoice, send a matching transfer to your `RECEIVING_ADDRESS` on HashKey testnet, and watch it match live.

### 4. HSP demo flow (simulate a payer)

```bash
cd hsp/demo
npm install
npm run pay      # pays an open invoice via the HSP SDK
npm run verify    # merchant-side verification of the payment
```

## Tech stack

- **Contracts**: Solidity 0.8.26, Foundry
- **Watcher**: TypeScript, viem, `node:sqlite`, OpenAI-compatible client for Tier 3, `tsx`
- **Dashboard**: Next.js 15, React 19, Tailwind, iron-session, viem
- **Chain**: HashKey Chain (testnet: chain ID 133, mainnet: chain ID 177)

## Deployed contracts

See [`contracts/deployments.json`](contracts/deployments.json) for current testnet and mainnet `InvoiceRegistry`/`MockUSDC` addresses and verification links.

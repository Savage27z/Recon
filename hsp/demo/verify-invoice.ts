/**
 * Merchant-side INDEPENDENT verification — doesn't trust the Coordinator's
 * word for it. Fetches the mandate + receipt, then runs HSPVerifier against
 * an adapter address pinned out-of-band (GET /chains, fetched once and
 * hardcoded below — never re-fetched from an untrusted source at verify time).
 *
 *   npx tsx verify-invoice.ts <paymentId>
 */
import type { Address } from 'viem';
import type { Receipt, SignedMandate } from '@hsp/core';
import { resolveChain } from '@hsp/core/chains/index';
import { HSPVerifier } from '@hsp/sdk';

const [paymentId] = process.argv.slice(2);
if (!paymentId) throw new Error('usage: tsx verify-invoice.ts <paymentId>');

const chain = resolveChain('hashkey-testnet');

// Pinned from GET https://hsp-hackathon.hashkeymerchant.com/chains (2026-07-08).
const ADAPTER_ADDRESS = '0x467AaF355DF243379B961Ce00abBae20c1e25012' as Address;

const base = (process.env.HSP_COORDINATOR_URL ?? 'https://hsp-hackathon.hashkeymerchant.com').replace(/\/$/, '');
const snap = (await (await fetch(`${base}/payments/${paymentId}`)).json()) as {
  mandate: SignedMandate;
  receipts: { receipt: Receipt }[];
};
if (!snap.receipts?.length) throw new Error('no admitted receipts yet');

const verifier = new HSPVerifier({ chain, adapterAddress: ADAPTER_ADDRESS });
const decision = await verifier.verify(snap.mandate, snap.receipts[snap.receipts.length - 1]!.receipt);
console.log(JSON.stringify(decision, null, 2));
console.log(decision.ok && decision.outcomeClass === 'ACCEPT' ? '→ SHIP' : '→ DO NOT SHIP');

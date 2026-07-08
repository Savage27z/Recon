/**
 * Pay a real Recon invoice through HSP: HSPClient.pay() signs a Mandate,
 * registers it with the hackathon Coordinator, broadcasts the actual ERC-20
 * transfer from the demo-payer wallet, then awaits settlement.
 *
 * Reads the demo-payer key straight from watcher/hsp-demo-payer.key at
 * runtime — never printed.
 *
 *   npx tsx pay-invoice.ts <recipient> <amount-base-units>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address, Hex } from 'viem';
import { resolveChain } from '@hsp/core/chains/index';
import { HSPClient } from '@hsp/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [to, amountArg] = process.argv.slice(2);
if (!to || !amountArg) throw new Error('usage: tsx pay-invoice.ts <recipient> <amount-base-units>');

const keyPath = path.resolve(__dirname, '../../watcher/hsp-demo-payer.key');
const privateKey = fs.readFileSync(keyPath, 'utf8').trim() as Hex;

const chain = resolveChain('hashkey-testnet');

const client = new HSPClient({
  coordinatorUrl: process.env.HSP_COORDINATOR_URL ?? 'https://hsp-hackathon.hashkeymerchant.com',
  signer: { kind: 'privateKey', privateKey },
  chain,
  apiKey: process.env.HSP_API_KEY,
});

const handle = await client.pay({ to: to as Address, amount: BigInt(amountArg) });
console.log(`paymentId ${handle.paymentId}`);
console.log(`txHash    ${handle.txHash}`);
console.log(`status    ${handle.status}`);
const final = await handle.awaitSettled();
console.log(`final     ${final.status}`);

/**
 * Create a Recon invoice denominated in HSP's pinned hashkey-testnet USDC,
 * so a real HSPClient.pay() (which only knows how to move the chain's
 * pinned stablecoin) lands on a token Recon's Tier 2 matcher is watching.
 *
 * Reads the merchant key straight from contracts/.env (DEPLOYER_PRIVATE_KEY)
 * at runtime — never printed.
 *
 *   npx tsx create-invoice.ts <amount-base-units>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [amountArg] = process.argv.slice(2);
if (!amountArg) throw new Error('usage: tsx create-invoice.ts <amount-base-units>');
const amount = BigInt(amountArg);

const envTxt = fs.readFileSync(path.resolve(__dirname, '../../contracts/.env'), 'utf8');
const keyLine = envTxt.split('\n').find((l) => /^DEPLOYER_PRIVATE_KEY=/.test(l.trim()));
if (!keyLine) throw new Error('DEPLOYER_PRIVATE_KEY not found in contracts/.env');
const rawKey = keyLine.split('=')[1]!.trim();
const merchantKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex;
const merchant = privateKeyToAccount(merchantKey);

const HSP_TESTNET_USDC = '0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6' as const;
const INVOICE_REGISTRY = '0x55Ec99E2F0fd1EcF3Ee20689fE21eD6bb0cD1235' as const;
const RPC_URL = 'https://testnet.hsk.xyz';
const CHAIN = { id: 133, name: 'hashkey-testnet', nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } };

const abi = parseAbi([
  'function createInvoice(bytes32 id, uint256 amount, address token, uint64 dueDate) external',
]);

const id = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}` as Hex;
const dueDate = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);

const wallet = createWalletClient({ account: merchant, chain: CHAIN, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

const txHash = await wallet.writeContract({
  address: INVOICE_REGISTRY,
  abi,
  functionName: 'createInvoice',
  args: [id, amount, HSP_TESTNET_USDC, dueDate],
});
console.log('createInvoice txHash:', txHash);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log('status:', receipt.status);
console.log('invoiceId:', id);
console.log('merchant:', merchant.address);
console.log('token:', HSP_TESTNET_USDC);
console.log('amount:', amount.toString());

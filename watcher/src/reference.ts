import type { Hex } from 'viem';

const ERC20_TRANSFER = '0xa9059cbb';
const ERC20_TRANSFER_FROM = '0x23b872dd';

/**
 * Extract an invoice-reference hint from the transaction calldata.
 *
 * Standard ERC20 `transfer(to, amount)` calldata is 4 selector + 32 to + 32 amount
 * = 68 bytes (138 hex chars including 0x). Same for `transferFrom` at 100 bytes
 * (202 hex chars). Solidity ignores trailing calldata bytes, so a checkout SDK
 * can append a 32-byte invoice id and the transfer still succeeds. We interpret
 * the last 32 bytes as the reference candidate. If it doesn't match a known
 * invoice, the matcher just ignores it.
 *
 * Returns null if the calldata doesn't look like a plain transfer, or if there
 * are no tail bytes.
 */
export function extractReference(input: Hex | undefined): Hex | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  const selector = lower.slice(0, 10);

  let standardLen: number;
  if (selector === ERC20_TRANSFER) standardLen = 138;
  else if (selector === ERC20_TRANSFER_FROM) standardLen = 202;
  else return null;

  // Only extract if a full 32-byte (64 hex char) tail is present.
  // Anything shorter is malformed data, not an invoice reference.
  if (lower.length - standardLen < 64) return null;
  return (`0x${lower.slice(-64)}`) as Hex;
}

import { isAddress } from 'viem';

export interface SiweFields {
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}

export function buildSiweMessage(f: SiweFields): string {
  return [
    `Recon wants you to sign in with your wallet.`,
    ``,
    `Address: ${f.address}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ].join('\n');
}

/**
 * Parses a message built by buildSiweMessage back into its fields, or null
 * if it doesn't match the expected shape. Used server-side to check the
 * claimed address/nonce/chain against the session and against the address
 * recovered from the signature.
 */
export function parseSiweMessage(message: string): SiweFields | null {
  const lines = message.split('\n');
  const get = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : null;
  };
  const address = get('Address: ');
  const chainIdRaw = get('Chain ID: ');
  const nonce = get('Nonce: ');
  const issuedAt = get('Issued At: ');
  if (!address || !isAddress(address) || !chainIdRaw || !nonce || !issuedAt) return null;
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId)) return null;
  return { address, chainId, nonce, issuedAt };
}

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 133);
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://testnet.hsk.xyz';
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://testnet-explorer.hsk.xyz';
export const INVOICE_REGISTRY = (process.env.NEXT_PUBLIC_INVOICE_REGISTRY ?? '') as `0x${string}`;

export interface TokenOption {
  symbol: string;
  address: `0x${string}`;
}

export const TOKENS: TokenOption[] = (process.env.NEXT_PUBLIC_TOKENS ?? '')
  .split(',')
  .filter(Boolean)
  .map((pair) => {
    const [symbol, address] = pair.split(':');
    return { symbol: symbol ?? '', address: (address ?? '') as `0x${string}` };
  });

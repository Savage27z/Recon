import { getAddress, isAddress, type Address } from 'viem';

// Standard convention (1inch, Paraswap, etc.) for representing a chain's
// native gas token as an ERC20-shaped "address" — HSK has no Transfer event
// of its own, so this is the sentinel value used in invoices/payments to
// mean "the native token" rather than any real ERC20 contract.
export const NATIVE_TOKEN: Address = getAddress('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseAddresses(csv: string): Address[] {
  const addrs = csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => {
      if (!isAddress(a)) throw new Error(`Invalid address in TOKENS: ${a}`);
      return getAddress(a);
    });
  if (addrs.length === 0) throw new Error('TOKENS must contain at least one address');
  return addrs;
}

function parsePositiveInt(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return n;
}

function parseBool(name: string, raw: string): boolean {
  const v = raw.toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === '') return false;
  throw new Error(`${name} must be true/false, got: ${raw}`);
}

function parseFloatIn(name: string, raw: string, lo: number, hi: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < lo || n > hi) {
    throw new Error(`${name} must be a number in [${lo}, ${hi}], got: ${raw}`);
  }
  return n;
}

export interface Tier3Config {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  minConfidence: number;
  toleranceBps: number; // basis points (100 = 1%)
  maxPerTick: number;
}

export interface WebhookPolicy {
  maxAttempts: number;
  timeoutMs: number;
  maxPerTick: number;
}

export interface Config {
  rpcUrl: string;
  chainId: number;
  tokens: Address[];
  invoiceRegistry: Address;
  startBlock: bigint;
  nativeStartBlock: bigint;
  pollIntervalMs: number;
  maxBlockRange: number;
  dbPath: string;
  tier3: Tier3Config;
  webhook: WebhookPolicy;
}

export function loadConfig(): Config {
  const registry = req('INVOICE_REGISTRY');
  if (!isAddress(registry)) throw new Error(`Invalid INVOICE_REGISTRY: ${registry}`);

  const apiKey = process.env['TIER3_API_KEY'] ?? null;
  const tier3EnabledFlag = parseBool('TIER3_ENABLED', opt('TIER3_ENABLED', 'true'));
  // Effective enablement: only true if flag is on AND we actually have a key.
  const tier3Enabled = tier3EnabledFlag && apiKey !== null && apiKey.length > 0;

  const tier3: Tier3Config = {
    enabled: tier3Enabled,
    apiKey,
    baseUrl: opt('TIER3_BASE_URL', 'https://api.badtheorylabs.com/v1'),
    model: opt('TIER3_MODEL', 'deepseek-v4-flash'),
    minConfidence: parseFloatIn('TIER3_MIN_CONFIDENCE', opt('TIER3_MIN_CONFIDENCE', '0.7'), 0, 1),
    toleranceBps: Math.round(
      parseFloatIn('TIER3_TOLERANCE_PCT', opt('TIER3_TOLERANCE_PCT', '5'), 0, 100) * 100,
    ),
    maxPerTick: parsePositiveInt('TIER3_MAX_PER_TICK', opt('TIER3_MAX_PER_TICK', '10')),
  };

  // Webhook destinations are per-merchant now (configured from the dashboard
  // Settings page and stored in merchant_settings) — only delivery policy
  // (retries/timeout/throughput) stays as global env-driven tuning.
  const webhook: WebhookPolicy = {
    maxAttempts: parsePositiveInt('WEBHOOK_MAX_ATTEMPTS', opt('WEBHOOK_MAX_ATTEMPTS', '5')),
    timeoutMs: parsePositiveInt('WEBHOOK_TIMEOUT_MS', opt('WEBHOOK_TIMEOUT_MS', '5000')),
    maxPerTick: parsePositiveInt('WEBHOOK_MAX_PER_TICK', opt('WEBHOOK_MAX_PER_TICK', '10')),
  };

  const startBlock = BigInt(parsePositiveInt('START_BLOCK', req('START_BLOCK')));
  // Native-transfer scanning reads whole blocks one at a time (no eth_getLogs
  // shortcut for a non-ERC20 token), so it must not be forced to crawl the
  // same historical range as the log-based scanners. Defaults to startBlock
  // for back-compat, but should be set to a recent block when native scanning
  // is first enabled so it starts from "now" instead of the chain's history.
  const nativeStartBlock = process.env['NATIVE_START_BLOCK']
    ? BigInt(parsePositiveInt('NATIVE_START_BLOCK', req('NATIVE_START_BLOCK')))
    : startBlock;

  return {
    rpcUrl: req('RPC_URL'),
    chainId: parsePositiveInt('CHAIN_ID', req('CHAIN_ID')),
    tokens: parseAddresses(req('TOKENS')),
    invoiceRegistry: getAddress(registry),
    startBlock,
    nativeStartBlock,
    pollIntervalMs: parsePositiveInt('POLL_INTERVAL_MS', opt('POLL_INTERVAL_MS', '10000')),
    maxBlockRange: parsePositiveInt('MAX_BLOCK_RANGE', opt('MAX_BLOCK_RANGE', '1000')),
    dbPath: opt('DB_PATH', './data/recon.db'),
    tier3,
    webhook,
  };
}

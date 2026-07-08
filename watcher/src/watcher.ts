import type { Address, Hex, PublicClient } from 'viem';
import { InvoiceCreatedEvent, InvoicePaidEvent, TransferEvent } from './abi.ts';
import type { Config } from './config.ts';
import { matchOpenInvoices, runTier3 } from './matcher.ts';
import type { PaymentRow, Store } from './db.ts';
import { extractReference } from './reference.ts';
import { OpenAITier3Client, type Tier3Client } from './tier3.ts';
import { runWebhookDispatch } from './webhook.ts';

function fmtAmount(raw: bigint, decimals = 6): string {
  const s = raw.toString().padStart(decimals + 1, '0');
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

async function timestampFor(
  client: PublicClient,
  cache: Map<bigint, bigint>,
  blockNumber: bigint,
): Promise<bigint> {
  const cached = cache.get(blockNumber);
  if (cached !== undefined) return cached;
  const block = await client.getBlock({ blockNumber });
  cache.set(blockNumber, block.timestamp);
  return block.timestamp;
}

async function scanToken(
  client: PublicClient,
  store: Store,
  cfg: Config,
  token: Address,
  latest: bigint,
  merchants: Address[],
): Promise<{ caughtUp: boolean }> {
  const cursor = store.getCursor(cfg.chainId, token);
  const from = cursor === null ? cfg.startBlock : cursor + 1n;
  if (from > latest) return { caughtUp: true };

  const windowEnd = from + BigInt(cfg.maxBlockRange) - 1n;
  const to = windowEnd > latest ? latest : windowEnd;

  // No merchant has onboarded yet — nothing to watch for, but still advance
  // the cursor so we don't have to replay a growing backlog once one does.
  if (merchants.length === 0) {
    store.setCursor(cfg.chainId, token, to);
    console.log(`[scan.payments] token=${token} blocks=${from}..${to} — no merchants onboarded yet`);
    return { caughtUp: to >= latest };
  }

  const logs = await client.getLogs({
    address: token,
    event: TransferEvent,
    args: { to: merchants },
    fromBlock: from,
    toBlock: to,
    strict: true,
  });

  const tsCache = new Map<bigint, bigint>();
  const txCache = new Map<Hex, Hex | undefined>();
  const rows: PaymentRow[] = [];

  for (const log of logs) {
    const ts = await timestampFor(client, tsCache, log.blockNumber);

    let input = txCache.get(log.transactionHash);
    if (input === undefined) {
      const tx = await client.getTransaction({ hash: log.transactionHash });
      input = tx.input;
      txCache.set(log.transactionHash, input);
    }

    rows.push({
      chainId: cfg.chainId,
      token,
      fromAddr: log.args.from!,
      toAddr: log.args.to!,
      amount: log.args.value!,
      blockNumber: log.blockNumber,
      blockTimestamp: ts,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      reference: extractReference(input),
    });
  }

  const inserted = store.insertPayments(rows);
  store.setCursor(cfg.chainId, token, to);

  if (inserted > 0) {
    for (const r of rows) {
      const refTag = r.reference ? ` ref=${r.reference.slice(0, 10)}…` : '';
      console.log(
        `[payment] token=${r.token} from=${r.fromAddr} amount=${fmtAmount(r.amount)} block=${r.blockNumber} tx=${r.txHash}${refTag}`,
      );
    }
  }
  const range = to - from + 1n;
  const suffix = inserted > 0 ? ` — ${inserted} payment(s)` : '';
  console.log(`[scan.payments] token=${token} blocks=${from}..${to} (${range})${suffix}`);
  return { caughtUp: to >= latest };
}

async function scanInvoiceRegistry(
  client: PublicClient,
  store: Store,
  cfg: Config,
  latest: bigint,
): Promise<{ caughtUp: boolean }> {
  const source = `invoices:${cfg.invoiceRegistry}`;
  const cursor = store.getCursor(cfg.chainId, source);
  const from = cursor === null ? cfg.startBlock : cursor + 1n;
  if (from > latest) return { caughtUp: true };

  const windowEnd = from + BigInt(cfg.maxBlockRange) - 1n;
  const to = windowEnd > latest ? latest : windowEnd;

  const [created, paid] = await Promise.all([
    client.getLogs({
      address: cfg.invoiceRegistry,
      event: InvoiceCreatedEvent,
      fromBlock: from,
      toBlock: to,
      strict: true,
    }),
    client.getLogs({
      address: cfg.invoiceRegistry,
      event: InvoicePaidEvent,
      fromBlock: from,
      toBlock: to,
      strict: true,
    }),
  ]);

  let createdCount = 0;
  for (const log of created) {
    const ok = store.upsertInvoice({
      chainId: cfg.chainId,
      id: log.args.id!,
      merchant: log.args.merchant!,
      token: log.args.token!,
      amount: log.args.amount!,
      dueDate: log.args.dueDate!,
      createdAtBlock: log.blockNumber,
      createdAtTx: log.transactionHash,
    });
    if (ok > 0) {
      createdCount++;
      console.log(
        `[invoice.created] id=${log.args.id} merchant=${log.args.merchant} token=${log.args.token} amount=${fmtAmount(log.args.amount!)}`,
      );
    }
  }

  let paidCount = 0;
  for (const log of paid) {
    const ok = store.markInvoicePaid(
      cfg.chainId,
      log.args.id!,
      log.blockNumber,
      log.transactionHash,
    );
    if (ok > 0) {
      paidCount++;
      console.log(`[invoice.paid] id=${log.args.id} tx=${log.transactionHash}`);
    }
  }

  store.setCursor(cfg.chainId, source, to);

  const range = to - from + 1n;
  const suffix =
    createdCount > 0 || paidCount > 0 ? ` — created=${createdCount} paid=${paidCount}` : '';
  console.log(`[scan.invoices] blocks=${from}..${to} (${range})${suffix}`);
  return { caughtUp: to >= latest };
}

export async function run(client: PublicClient, store: Store, cfg: Config): Promise<void> {
  const tier3: Tier3Client | null = cfg.tier3.enabled ? new OpenAITier3Client(cfg.tier3) : null;
  console.log(
    `[watcher] chain=${cfg.chainId} tokens=${cfg.tokens.length} registry=${cfg.invoiceRegistry} poll=${cfg.pollIntervalMs}ms tier3=${tier3 ? cfg.tier3.model : 'disabled'} webhook=per-merchant(max_attempts=${cfg.webhook.maxAttempts})`,
  );

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    console.log('\n[watcher] shutting down');
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopped) {
    let anyBehind = false;
    try {
      const latest = await client.getBlockNumber();

      // Fully catch the invoice registry up to `latest` before deriving the
      // merchant set — a merchant who just registered must be in that set
      // before this tick's payment scans run, or their Transfer log is
      // permanently lost once the token cursor advances past that block.
      while (!stopped) {
        const { caughtUp } = await scanInvoiceRegistry(client, store, cfg, latest);
        if (caughtUp) break;
      }

      const merchants = store.distinctMerchants(cfg.chainId);
      for (const token of cfg.tokens) {
        if (stopped) break;
        const { caughtUp } = await scanToken(client, store, cfg, token, latest, merchants);
        if (!caughtUp) anyBehind = true;
      }
      if (!stopped) {
        const matches = matchOpenInvoices(store, cfg.chainId);
        if (matches > 0) console.log(`[matcher] tier1/2 matches this tick: ${matches}`);
      }
      if (!stopped && tier3) {
        const t3 = await runTier3(store, cfg, tier3);
        if (t3.evaluated > 0) {
          console.log(`[tier3] evaluated=${t3.evaluated} matched=${t3.matched}`);
        }
      }
      if (!stopped) {
        const wh = await runWebhookDispatch(store, cfg.chainId, cfg.webhook);
        if (wh.delivered + wh.failed > 0) {
          console.log(`[webhook] delivered=${wh.delivered} failed=${wh.failed}`);
        }
      }
    } catch (err) {
      console.error('[watcher] tick failed:', err instanceof Error ? err.message : err);
    }
    if (!stopped && !anyBehind) await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

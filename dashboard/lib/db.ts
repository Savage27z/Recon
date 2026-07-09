import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { TOKENS } from './chain';

const CHAIN_ID = Number(process.env['RECON_CHAIN_ID'] ?? 133);
const DB_PATH = resolve(
  process.env['RECON_DB_PATH'] ?? '../watcher/data/recon.db',
);
const REVIEW_MAX_CONFIDENCE = Number(
  process.env['RECON_REVIEW_MAX_CONFIDENCE'] ?? 0.95,
);

let cached: DatabaseSync | null = null;
function db(): DatabaseSync {
  if (cached) return cached;
  cached = new DatabaseSync(DB_PATH, { readOnly: true });
  return cached;
}

// Separate read-write connection, opened lazily and only used by the review
// (approve/reject) write path. The main `db()` connection above stays
// read-only — the watcher process is the sole writer of its own tables.
let cachedRw: DatabaseSync | null = null;
function rwDb(): DatabaseSync {
  if (cachedRw) return cachedRw;
  cachedRw = new DatabaseSync(DB_PATH);
  cachedRw.exec('PRAGMA busy_timeout = 5000');
  cachedRw.exec(`
    CREATE TABLE IF NOT EXISTS review_decisions (
      chain_id     INTEGER NOT NULL,
      invoice_id   TEXT    NOT NULL,
      tx_hash      TEXT    NOT NULL,
      log_index    INTEGER NOT NULL,
      decision     TEXT    NOT NULL,
      decided_at   INTEGER NOT NULL,
      PRIMARY KEY (chain_id, invoice_id)
    );
  `);
  cachedRw.exec(`
    CREATE TABLE IF NOT EXISTS merchant_settings (
      chain_id       INTEGER NOT NULL,
      merchant       TEXT    NOT NULL,
      webhook_url    TEXT,
      webhook_secret TEXT,
      updated_at     INTEGER NOT NULL,
      PRIMARY KEY (chain_id, merchant)
    );
  `);
  return cachedRw;
}

// Ensure review_decisions exists before any read-only query references it —
// db() can't CREATE TABLE since it's opened read-only. Swallow failures here:
// Next's build-time page-data collection imports this module before the
// database file exists (e.g. in a fresh container build); tables still get
// created lazily on the first real request via rwDb().
try {
  rwDb();
} catch {
  // no-op — see comment above
}

export type ReviewDecision = 'approved' | 'rejected';

/**
 * Approve = record the decision only; the match (and its already-fired
 * webhook) stands. Reject = record the decision, delete the match, and
 * reset the invoice back to 'open' (only if still 'matched' — never clobber
 * a 'paid' status, which is a terminal on-chain fact set by the watcher).
 *
 * `matches` is keyed by (chain_id, invoice_id), so invoiceId alone identifies
 * the row; txHash is carried along only as a client-side integrity check.
 */
export function decideMatch(
  merchant: string,
  invoiceId: string,
  txHash: string,
  decision: ReviewDecision,
): void {
  const conn = rwDb();
  const match = conn
    .prepare(
      `SELECT m.tx_hash FROM matches m
       JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
       WHERE m.chain_id = ? AND m.invoice_id = ? AND LOWER(i.merchant) = LOWER(?)`,
    )
    .get(CHAIN_ID, invoiceId, merchant) as { tx_hash: string } | undefined;
  if (!match || match.tx_hash !== txHash) {
    throw new Error('match not found or already decided');
  }

  conn.exec('BEGIN');
  try {
    conn
      .prepare(
        `INSERT INTO review_decisions (chain_id, invoice_id, tx_hash, log_index, decision, decided_at)
         VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT (chain_id, invoice_id) DO UPDATE SET
           tx_hash = excluded.tx_hash,
           decision = excluded.decision,
           decided_at = excluded.decided_at`,
      )
      .run(CHAIN_ID, invoiceId, txHash, decision, Date.now());

    if (decision === 'rejected') {
      conn
        .prepare(`DELETE FROM matches WHERE chain_id = ? AND invoice_id = ?`)
        .run(CHAIN_ID, invoiceId);
      conn
        .prepare(
          `UPDATE invoices SET status = 'open'
           WHERE chain_id = ? AND id = ? AND status = 'matched'`,
        )
        .run(CHAIN_ID, invoiceId);
    }
    conn.exec('COMMIT');
  } catch (e) {
    conn.exec('ROLLBACK');
    throw e;
  }
}

export interface StatBlock {
  matchedToday: number;
  volumeToday6dp: string;
  autoRatePct: number;
  queueCount: number;
}

export interface QueueItem {
  invoiceId: string;
  invoiceShort: string;
  invoiceAmount6dp: string;
  paymentAmount6dp: string;
  wallet: string;
  txHash: string;
  ageLabel: string;
  reason: string;
  confidencePct: number;
}

export interface FeedItem {
  txHash: string;
  amount6dp: string;
  invoice: string;
  wallet: string;
  ageLabel: string;
  tierLabel: string;
  tierColor: string;
}

export interface MatchRow {
  invoiceId: string;
  invoiceShort: string;
  amount6dp: string;
  wallet: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  tierBg: string;
  tierFg: string;
  ageLabel: string;
}

function decimalsFor(token: string): number {
  return TOKENS.find((t) => t.address.toLowerCase() === token.toLowerCase())?.decimals ?? 6;
}

function symbolFor(token: string): string {
  return TOKENS.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? short(token);
}

function fmtAmount(raw: bigint | string | number, decimals: number): string {
  const b = typeof raw === 'bigint' ? raw : BigInt(String(raw));
  const s = b.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${s.slice(-decimals)}`;
}

function short(addr: string, front = 6, back = 4): string {
  if (addr.length <= front + back + 3) return addr;
  return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

function invoiceShort(id: string): string {
  return `#${id.slice(2, 6).toUpperCase()}${id.slice(-4).toUpperCase()}`;
}

function ageLabel(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3_600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function tierBadge(tier: number): { label: string; color: string; bg: string; fg: string } {
  if (tier === 1) return { label: 'Tier 1', color: '#58CC02', bg: '#E9F6D9', fg: '#3F9600' };
  if (tier === 2) return { label: 'Tier 2', color: '#58CC02', bg: '#E9F6D9', fg: '#3F9600' };
  return { label: 'AI', color: '#FF6A39', bg: '#FDF3EC', fg: '#B9603A' };
}

export function getStats(merchant: string): StatBlock {
  const nowSec = Math.floor(Date.now() / 1000);
  const startOfDayMs = (nowSec - (nowSec % 86400)) * 1000;

  const matchedToday = (
    db()
      .prepare(
        `SELECT COUNT(*) c FROM matches m
         JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
         WHERE m.chain_id = ? AND m.created_at >= ? AND LOWER(i.merchant) = LOWER(?)`,
      )
      .get(CHAIN_ID, startOfDayMs, merchant) as { c: number }
  ).c;

  // Grouped per-token: different tokens can have different decimals (HSK is
  // 18dp vs the stablecoins' 6dp), so a single blended SUM would be
  // meaningless — report each token's volume separately instead.
  // SUM is cast to TEXT, not left as a raw INTEGER column: node:sqlite throws
  // ("Value is too large to be represented as a JavaScript number") for any
  // 64-bit SQL integer past Number.MAX_SAFE_INTEGER, which HSK's 18-decimal
  // amounts (~10^18) blow straight through. Stringifying keeps it a lossless
  // BigInt-parseable value instead.
  const volumeRows = db()
    .prepare(
      `SELECT p.token token, CAST(COALESCE(SUM(CAST(p.amount AS INTEGER)), 0) AS TEXT) sum
       FROM matches m
       JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
       JOIN payments p
         ON p.chain_id = m.chain_id
        AND p.tx_hash = m.tx_hash
        AND p.log_index = m.log_index
       WHERE m.chain_id = ? AND m.created_at >= ? AND LOWER(i.merchant) = LOWER(?)
       GROUP BY p.token`,
    )
    .all(CHAIN_ID, startOfDayMs, merchant) as Array<{ token: string; sum: string }>;
  const volumeToday6dp =
    volumeRows.length === 0
      ? '0.000000'
      : volumeRows
          .map((r) => `${fmtAmount(r.sum, decimalsFor(r.token))} ${symbolFor(r.token)}`)
          .join(' + ');

  const total = (
    db()
      .prepare(
        `SELECT COUNT(*) c FROM matches m
         JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
         WHERE m.chain_id = ? AND LOWER(i.merchant) = LOWER(?)`,
      )
      .get(CHAIN_ID, merchant) as { c: number }
  ).c;
  const queue = queueCount(merchant);
  // Auto-rate = matches that fired without human review, over all matches.
  // The queue subset is included in `total`, so subtract it from the numerator.
  const autoRatePct = total === 0 ? 100 : Math.round(((total - queue) / total) * 100);

  return {
    matchedToday,
    volumeToday6dp,
    autoRatePct,
    queueCount: queue,
  };
}

function queueCount(merchant: string): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) c FROM matches m
         JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
         WHERE m.chain_id = ? AND m.tier = 3 AND m.confidence < ? AND LOWER(i.merchant) = LOWER(?)
           AND NOT EXISTS (
             SELECT 1 FROM review_decisions d
             WHERE d.chain_id = m.chain_id AND d.invoice_id = m.invoice_id
           )`,
      )
      .get(CHAIN_ID, REVIEW_MAX_CONFIDENCE, merchant) as { c: number }
  ).c;
}

export function getQueue(merchant: string, limit = 25): QueueItem[] {
  const rows = db()
    .prepare(
      `SELECT m.invoice_id, m.confidence, m.evidence, m.created_at,
              i.amount inv_amount, i.token inv_token,
              p.amount pay_amount, p.from_addr, p.tx_hash, p.block_timestamp
       FROM matches m
       JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
       JOIN payments p
         ON p.chain_id = m.chain_id
        AND p.tx_hash = m.tx_hash
        AND p.log_index = m.log_index
       WHERE m.chain_id = ? AND m.tier = 3 AND m.confidence < ? AND LOWER(i.merchant) = LOWER(?)
         AND NOT EXISTS (
           SELECT 1 FROM review_decisions d
           WHERE d.chain_id = m.chain_id AND d.invoice_id = m.invoice_id
         )
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(CHAIN_ID, REVIEW_MAX_CONFIDENCE, merchant, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    let evidence: { reasoning?: string } = {};
    try {
      evidence = JSON.parse(String(r.evidence));
    } catch { /* noop */ }
    const decimals = decimalsFor(String(r.inv_token));
    return {
      invoiceId: String(r.invoice_id),
      invoiceShort: invoiceShort(String(r.invoice_id)),
      invoiceAmount6dp: fmtAmount(String(r.inv_amount), decimals),
      paymentAmount6dp: fmtAmount(String(r.pay_amount), decimals),
      wallet: short(String(r.from_addr)),
      txHash: String(r.tx_hash),
      ageLabel: ageLabel(Number(r.block_timestamp)),
      reason: evidence.reasoning?.slice(0, 100) ?? 'LLM low-confidence match',
      confidencePct: Math.round(Number(r.confidence) * 100),
    };
  });
}

export function getFeed(merchant: string, limit = 20): FeedItem[] {
  const rows = db()
    .prepare(
      `SELECT p.tx_hash, p.amount, p.token, p.from_addr, p.block_timestamp,
              m.invoice_id, m.tier
       FROM payments p
       LEFT JOIN matches m
         ON m.chain_id = p.chain_id
        AND m.tx_hash = p.tx_hash
        AND m.log_index = p.log_index
       WHERE p.chain_id = ? AND LOWER(p.to_addr) = LOWER(?)
       ORDER BY p.block_number DESC
       LIMIT ?`,
    )
    .all(CHAIN_ID, merchant, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const tier = r.tier == null ? null : Number(r.tier);
    const badge = tier == null
      ? { label: 'Unmatched', color: '#8A8578', bg: '', fg: '' }
      : tierBadge(tier);
    const invLabel = r.invoice_id ? invoiceShort(String(r.invoice_id)) : 'unmatched';
    return {
      txHash: String(r.tx_hash),
      amount6dp: fmtAmount(String(r.amount), decimalsFor(String(r.token))),
      invoice: invLabel,
      wallet: short(String(r.from_addr)),
      ageLabel: ageLabel(Number(r.block_timestamp)),
      tierLabel: badge.label,
      tierColor: badge.color,
    };
  });
}

export interface WebhookSettings {
  url: string;
  secret: string;
}

export function getWebhookSettings(merchant: string): WebhookSettings | null {
  const row = rwDb()
    .prepare(
      `SELECT webhook_url, webhook_secret FROM merchant_settings
       WHERE chain_id = ? AND LOWER(merchant) = LOWER(?)`,
    )
    .get(CHAIN_ID, merchant) as
    | { webhook_url: string | null; webhook_secret: string | null }
    | undefined;
  if (!row || !row.webhook_url || !row.webhook_secret) return null;
  return { url: row.webhook_url, secret: row.webhook_secret };
}

export function setWebhookSettings(merchant: string, url: string, secret: string): void {
  rwDb()
    .prepare(
      `INSERT INTO merchant_settings (chain_id, merchant, webhook_url, webhook_secret, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (chain_id, merchant) DO UPDATE SET
         webhook_url = excluded.webhook_url,
         webhook_secret = excluded.webhook_secret,
         updated_at = excluded.updated_at`,
    )
    .run(CHAIN_ID, merchant, url, secret, Date.now());
}

export interface InvoiceRow {
  id: string;
  idShort: string;
  amount6dp: string;
  token: string;
  tokenShort: string;
  dueDateLabel: string;
  status: string;
  createdTx: string;
  ageLabel: string;
}

export function getInvoices(merchant: string, limit = 50): InvoiceRow[] {
  const rows = db()
    .prepare(
      `SELECT id, amount, token, due_date, status, created_at_tx, seen_at
       FROM invoices
       WHERE chain_id = ? AND LOWER(merchant) = LOWER(?)
       ORDER BY seen_at DESC
       LIMIT ?`,
    )
    .all(CHAIN_ID, merchant, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    idShort: invoiceShort(String(r.id)),
    amount6dp: fmtAmount(String(r.amount), decimalsFor(String(r.token))),
    token: String(r.token),
    tokenShort: short(String(r.token)),
    dueDateLabel: new Date(Number(r.due_date) * 1000).toLocaleDateString(),
    status: String(r.status),
    createdTx: String(r.created_at_tx),
    ageLabel: ageLabel(Math.floor(Number(r.seen_at) / 1000)),
  }));
}

export function getRecentMatches(merchant: string, limit = 15): MatchRow[] {
  const rows = db()
    .prepare(
      `SELECT m.invoice_id, m.tier, m.created_at,
              p.amount, p.token, p.from_addr, p.block_timestamp
       FROM matches m
       JOIN invoices i ON i.chain_id = m.chain_id AND i.id = m.invoice_id
       JOIN payments p
         ON p.chain_id = m.chain_id
        AND p.tx_hash = m.tx_hash
        AND p.log_index = m.log_index
       WHERE m.chain_id = ? AND LOWER(i.merchant) = LOWER(?)
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(CHAIN_ID, merchant, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const tier = Number(r.tier) as 1 | 2 | 3;
    const badge = tierBadge(tier);
    return {
      invoiceId: String(r.invoice_id),
      invoiceShort: invoiceShort(String(r.invoice_id)),
      amount6dp: fmtAmount(String(r.amount), decimalsFor(String(r.token))),
      wallet: short(String(r.from_addr)),
      tier,
      tierLabel: badge.label,
      tierBg: badge.bg,
      tierFg: badge.fg,
      ageLabel: ageLabel(Number(r.block_timestamp)),
    };
  });
}

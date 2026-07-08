import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address, Hex } from 'viem';

export type InvoiceStatus = 'open' | 'matched' | 'paid';

export interface PaymentRow {
  chainId: number;
  token: Address;
  fromAddr: Address;
  toAddr: Address;
  amount: bigint;
  blockNumber: bigint;
  blockTimestamp: bigint;
  txHash: Hex;
  logIndex: number;
  reference: Hex | null;
}

export interface InvoiceRow {
  chainId: number;
  id: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  dueDate: bigint;
  status: InvoiceStatus;
  createdAtBlock: bigint;
  createdAtTx: Hex;
  paidAtBlock: bigint | null;
  paidAtTx: Hex | null;
}

export interface MatchRow {
  chainId: number;
  invoiceId: Hex;
  txHash: Hex;
  logIndex: number;
  tier: 1 | 2 | 3;
  confidence: number;
  evidence: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watcher_cursor (
        chain_id     INTEGER NOT NULL,
        source       TEXT    NOT NULL,
        last_block   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (chain_id, source)
      );

      CREATE TABLE IF NOT EXISTS payments (
        chain_id        INTEGER NOT NULL,
        tx_hash         TEXT    NOT NULL,
        log_index       INTEGER NOT NULL,
        token           TEXT    NOT NULL,
        from_addr       TEXT    NOT NULL,
        to_addr         TEXT    NOT NULL,
        amount          TEXT    NOT NULL,
        block_number    INTEGER NOT NULL,
        block_timestamp INTEGER NOT NULL,
        seen_at         INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS payments_to_addr_idx
        ON payments(chain_id, to_addr, block_number);
      CREATE INDEX IF NOT EXISTS payments_token_block_idx
        ON payments(chain_id, token, block_number);

      CREATE TABLE IF NOT EXISTS invoices (
        chain_id         INTEGER NOT NULL,
        id               TEXT    NOT NULL,
        merchant         TEXT    NOT NULL,
        token            TEXT    NOT NULL,
        amount           TEXT    NOT NULL,
        due_date         INTEGER NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'open',
        created_at_block INTEGER NOT NULL,
        created_at_tx    TEXT    NOT NULL,
        paid_at_block    INTEGER,
        paid_at_tx       TEXT,
        seen_at          INTEGER NOT NULL,
        PRIMARY KEY (chain_id, id)
      );

      CREATE INDEX IF NOT EXISTS invoices_open_token_amount_idx
        ON invoices(chain_id, token, amount, status);

      CREATE TABLE IF NOT EXISTS merchant_settings (
        chain_id       INTEGER NOT NULL,
        merchant       TEXT    NOT NULL,
        webhook_url    TEXT,
        webhook_secret TEXT,
        updated_at     INTEGER NOT NULL,
        PRIMARY KEY (chain_id, merchant)
      );

      CREATE TABLE IF NOT EXISTS matches (
        chain_id     INTEGER NOT NULL,
        invoice_id   TEXT    NOT NULL,
        tx_hash      TEXT    NOT NULL,
        log_index    INTEGER NOT NULL,
        tier         INTEGER NOT NULL,
        confidence   REAL    NOT NULL,
        evidence     TEXT    NOT NULL,
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (chain_id, invoice_id),
        UNIQUE (chain_id, tx_hash, log_index)
      );
    `);

    const matchCols = this.db.prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>;
    if (!matchCols.some((c) => c.name === 'webhook_attempts')) {
      this.db.exec('ALTER TABLE matches ADD COLUMN webhook_attempts INTEGER NOT NULL DEFAULT 0');
    }
    if (!matchCols.some((c) => c.name === 'webhook_delivered_at')) {
      this.db.exec('ALTER TABLE matches ADD COLUMN webhook_delivered_at INTEGER');
    }
    if (!matchCols.some((c) => c.name === 'webhook_last_error')) {
      this.db.exec('ALTER TABLE matches ADD COLUMN webhook_last_error TEXT');
    }

    // Add reference column to payments if it doesn't exist (idempotent).
    const cols = this.db.prepare('PRAGMA table_info(payments)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'reference')) {
      this.db.exec('ALTER TABLE payments ADD COLUMN reference TEXT');
    }
    if (!cols.some((c) => c.name === 'tier3_attempted_at')) {
      this.db.exec('ALTER TABLE payments ADD COLUMN tier3_attempted_at INTEGER');
    }
    if (!cols.some((c) => c.name === 'tier3_decision')) {
      this.db.exec('ALTER TABLE payments ADD COLUMN tier3_decision TEXT');
    }
    if (!cols.some((c) => c.name === 'tier3_failure_count')) {
      this.db.exec('ALTER TABLE payments ADD COLUMN tier3_failure_count INTEGER NOT NULL DEFAULT 0');
    }

    // Historical: earlier schema had watcher_cursor(token). Migrate to (source).
    const cursorCols = this.db.prepare('PRAGMA table_info(watcher_cursor)').all() as Array<{ name: string }>;
    if (cursorCols.some((c) => c.name === 'token') && !cursorCols.some((c) => c.name === 'source')) {
      this.db.exec('ALTER TABLE watcher_cursor RENAME COLUMN token TO source');
    }
  }

  getCursor(chainId: number, source: string): bigint | null {
    const row = this.db
      .prepare('SELECT last_block FROM watcher_cursor WHERE chain_id = ? AND source = ?')
      .get(chainId, source) as { last_block: number | bigint } | undefined;
    if (!row) return null;
    return BigInt(row.last_block);
  }

  setCursor(chainId: number, source: string, lastBlock: bigint): void {
    this.db
      .prepare(
        `INSERT INTO watcher_cursor (chain_id, source, last_block, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (chain_id, source) DO UPDATE SET
           last_block = excluded.last_block,
           updated_at = excluded.updated_at`,
      )
      .run(chainId, source, lastBlock, Date.now());
  }

  insertPayments(rows: PaymentRow[]): number {
    if (rows.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO payments
         (chain_id, tx_hash, log_index, token, from_addr, to_addr, amount,
          block_number, block_timestamp, seen_at, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    let inserted = 0;
    this.db.exec('BEGIN');
    try {
      for (const r of rows) {
        const res = stmt.run(
          r.chainId,
          r.txHash,
          r.logIndex,
          r.token,
          r.fromAddr,
          r.toAddr,
          r.amount.toString(),
          r.blockNumber,
          r.blockTimestamp,
          now,
          r.reference,
        );
        if (Number(res.changes) > 0) inserted++;
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return inserted;
  }

  upsertInvoice(row: Omit<InvoiceRow, 'status' | 'paidAtBlock' | 'paidAtTx'>): number {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO invoices
           (chain_id, id, merchant, token, amount, due_date, status,
            created_at_block, created_at_tx, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      )
      .run(
        row.chainId,
        row.id,
        row.merchant,
        row.token,
        row.amount.toString(),
        row.dueDate,
        row.createdAtBlock,
        row.createdAtTx,
        Date.now(),
      );
    return Number(res.changes);
  }

  markInvoicePaid(
    chainId: number,
    invoiceId: Hex,
    paidAtBlock: bigint,
    paidAtTx: Hex,
  ): number {
    const res = this.db
      .prepare(
        `UPDATE invoices
         SET status = 'paid', paid_at_block = ?, paid_at_tx = ?
         WHERE chain_id = ? AND id = ? AND status != 'paid'`,
      )
      .run(paidAtBlock, paidAtTx, chainId, invoiceId);
    return Number(res.changes);
  }

  /**
   * Every distinct merchant address that has ever created an invoice on this
   * chain — the watched-address set for the multi-tenant payment scan.
   */
  distinctMerchants(chainId: number): Address[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT merchant FROM invoices WHERE chain_id = ?`)
      .all(chainId) as Array<{ merchant: Address }>;
    return rows.map((r) => r.merchant);
  }

  openInvoices(chainId: number): InvoiceRow[] {
    const rows = this.db
      .prepare(
        `SELECT chain_id, id, merchant, token, amount, due_date, status,
                created_at_block, created_at_tx, paid_at_block, paid_at_tx
         FROM invoices WHERE chain_id = ? AND status = 'open'`,
      )
      .all(chainId) as Array<Record<string, unknown>>;
    return rows.map(this.rowToInvoice);
  }

  private rowToInvoice = (r: Record<string, unknown>): InvoiceRow => ({
    chainId: r.chain_id as number,
    id: r.id as Hex,
    merchant: r.merchant as Address,
    token: r.token as Address,
    amount: BigInt(r.amount as string),
    dueDate: BigInt(r.due_date as string | number),
    status: r.status as InvoiceStatus,
    createdAtBlock: BigInt(r.created_at_block as string | number),
    createdAtTx: r.created_at_tx as Hex,
    paidAtBlock: r.paid_at_block == null ? null : BigInt(r.paid_at_block as string | number),
    paidAtTx: (r.paid_at_tx as Hex | null) ?? null,
  });

  /**
   * Payments matching (token, amount) that have not yet been matched to any invoice.
   * Used for Tier 2 exact-amount lookup. Scoped to payments received by
   * `merchant` — without this, a payment sent to a different merchant with a
   * coincidentally identical (token, amount) would be eligible to match this
   * invoice, incorrectly marking it paid from someone else's incoming funds.
   */
  unmatchedPaymentsFor(
    chainId: number,
    token: Address,
    amount: bigint,
    merchant: Address,
  ): Array<{ txHash: Hex; logIndex: number; reference: Hex | null; blockNumber: bigint }> {
    const rows = this.db
      .prepare(
        `SELECT p.tx_hash, p.log_index, p.reference, p.block_number
         FROM payments p
         LEFT JOIN matches m
           ON m.chain_id = p.chain_id
          AND m.tx_hash = p.tx_hash
          AND m.log_index = p.log_index
         WHERE p.chain_id = ?
           AND p.token = ?
           AND p.amount = ?
           AND LOWER(p.to_addr) = LOWER(?)
           AND m.invoice_id IS NULL`,
      )
      .all(chainId, token, amount.toString(), merchant) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      txHash: r.tx_hash as Hex,
      logIndex: r.log_index as number,
      reference: (r.reference as Hex | null) ?? null,
      blockNumber: BigInt(r.block_number as string | number),
    }));
  }

  insertMatch(row: MatchRow): number {
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      const res = this.db
        .prepare(
          `INSERT OR IGNORE INTO matches
             (chain_id, invoice_id, tx_hash, log_index, tier, confidence, evidence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.chainId,
          row.invoiceId,
          row.txHash,
          row.logIndex,
          row.tier,
          row.confidence,
          row.evidence,
          now,
        );
      const inserted = Number(res.changes);
      if (inserted > 0) {
        this.db
          .prepare(
            `UPDATE invoices SET status = 'matched'
             WHERE chain_id = ? AND id = ? AND status = 'open'`,
          )
          .run(row.chainId, row.invoiceId);
      }
      this.db.exec('COMMIT');
      return inserted;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Payments with no match yet and no Tier 3 attempt yet. Used by the LLM
   * matcher to decide which payments to spend a Claude call on.
   */
  paymentsPendingTier3(
    chainId: number,
    limit: number,
  ): Array<{
    txHash: Hex;
    logIndex: number;
    token: Address;
    fromAddr: Address;
    toAddr: Address;
    amount: bigint;
    blockNumber: bigint;
    blockTimestamp: bigint;
    reference: Hex | null;
  }> {
    const rows = this.db
      .prepare(
        `SELECT p.tx_hash, p.log_index, p.token, p.from_addr, p.to_addr, p.amount,
                p.block_number, p.block_timestamp, p.reference
         FROM payments p
         LEFT JOIN matches m
           ON m.chain_id = p.chain_id
          AND m.tx_hash = p.tx_hash
          AND m.log_index = p.log_index
         WHERE p.chain_id = ?
           AND m.invoice_id IS NULL
           AND p.tier3_attempted_at IS NULL
         ORDER BY p.block_number ASC, p.log_index ASC
         LIMIT ?`,
      )
      .all(chainId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      txHash: r.tx_hash as Hex,
      logIndex: r.log_index as number,
      token: r.token as Address,
      fromAddr: r.from_addr as Address,
      toAddr: r.to_addr as Address,
      amount: BigInt(r.amount as string),
      blockNumber: BigInt(r.block_number as string | number),
      blockTimestamp: BigInt(r.block_timestamp as string | number),
      reference: (r.reference as Hex | null) ?? null,
    }));
  }

  /**
   * Open invoices with matching token whose amount is within ±(bpsTolerance)
   * of the target amount. Used by Tier 3 to build the candidate set.
   *
   * SQLite integer math handles amounts up to 2^63. For >6-decimal stablecoins
   * at realistic invoice sizes we're nowhere near that.
   */
  candidateOpenInvoicesByToken(
    chainId: number,
    token: Address,
    amount: bigint,
    bpsTolerance: number,
    merchant: Address,
  ): InvoiceRow[] {
    const delta = (amount * BigInt(bpsTolerance)) / 10_000n;
    const lo = amount > delta ? amount - delta : 0n;
    const hi = amount + delta;
    const rows = this.db
      .prepare(
        `SELECT chain_id, id, merchant, token, amount, due_date, status,
                created_at_block, created_at_tx, paid_at_block, paid_at_tx
         FROM invoices
         WHERE chain_id = ?
           AND status = 'open'
           AND token = ?
           AND LOWER(merchant) = LOWER(?)
           AND CAST(amount AS INTEGER) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)`,
      )
      .all(chainId, token, merchant, lo.toString(), hi.toString()) as Array<Record<string, unknown>>;
    return rows.map(this.rowToInvoice);
  }

  setTier3Decision(
    chainId: number,
    txHash: Hex,
    logIndex: number,
    decision: unknown,
  ): void {
    this.db
      .prepare(
        `UPDATE payments
         SET tier3_attempted_at = ?, tier3_decision = ?
         WHERE chain_id = ? AND tx_hash = ? AND log_index = ?`,
      )
      .run(Date.now(), JSON.stringify(decision), chainId, txHash, logIndex);
  }

  /**
   * Increment the transient-failure counter. When it crosses the cap the
   * caller should give up and set a terminal decision via setTier3Decision.
   */
  bumpTier3FailureCount(chainId: number, txHash: Hex, logIndex: number): number {
    this.db
      .prepare(
        `UPDATE payments SET tier3_failure_count = tier3_failure_count + 1
         WHERE chain_id = ? AND tx_hash = ? AND log_index = ?`,
      )
      .run(chainId, txHash, logIndex);
    const row = this.db
      .prepare(
        `SELECT tier3_failure_count AS c FROM payments
         WHERE chain_id = ? AND tx_hash = ? AND log_index = ?`,
      )
      .get(chainId, txHash, logIndex) as { c: number } | undefined;
    return row?.c ?? 0;
  }

  /**
   * Matches that haven't been delivered yet and haven't exceeded the retry cap.
   * Joined with invoice + payment rows so the webhook payload can be built
   * from one row of data.
   */
  matchesPendingWebhook(
    chainId: number,
    maxAttempts: number,
    limit: number,
  ): Array<{
    invoiceId: Hex;
    txHash: Hex;
    logIndex: number;
    tier: 1 | 2 | 3;
    confidence: number;
    evidence: string;
    attempts: number;
    createdAt: number;
    invoiceMerchant: Address;
    invoiceToken: Address;
    invoiceAmount: bigint;
    invoiceDueDate: bigint;
    paymentAmount: bigint;
    paymentFrom: Address;
    paymentTo: Address;
    paymentBlockNumber: bigint;
    paymentBlockTimestamp: bigint;
  }> {
    const rows = this.db
      .prepare(
        `SELECT m.invoice_id, m.tx_hash, m.log_index, m.tier, m.confidence, m.evidence,
                m.webhook_attempts, m.created_at,
                i.merchant AS inv_merchant, i.token AS inv_token,
                i.amount AS inv_amount, i.due_date AS inv_due_date,
                p.amount AS pay_amount, p.from_addr AS pay_from, p.to_addr AS pay_to,
                p.block_number AS pay_block, p.block_timestamp AS pay_ts
         FROM matches m
         JOIN invoices i
           ON i.chain_id = m.chain_id AND i.id = m.invoice_id
         JOIN payments p
           ON p.chain_id = m.chain_id AND p.tx_hash = m.tx_hash AND p.log_index = m.log_index
         WHERE m.chain_id = ?
           AND m.webhook_delivered_at IS NULL
           AND m.webhook_attempts < ?
         ORDER BY m.created_at ASC
         LIMIT ?`,
      )
      .all(chainId, maxAttempts, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      invoiceId: r.invoice_id as Hex,
      txHash: r.tx_hash as Hex,
      logIndex: r.log_index as number,
      tier: r.tier as 1 | 2 | 3,
      confidence: r.confidence as number,
      evidence: r.evidence as string,
      attempts: r.webhook_attempts as number,
      createdAt: r.created_at as number,
      invoiceMerchant: r.inv_merchant as Address,
      invoiceToken: r.inv_token as Address,
      invoiceAmount: BigInt(r.inv_amount as string),
      invoiceDueDate: BigInt(r.inv_due_date as string | number),
      paymentAmount: BigInt(r.pay_amount as string),
      paymentFrom: r.pay_from as Address,
      paymentTo: r.pay_to as Address,
      paymentBlockNumber: BigInt(r.pay_block as string | number),
      paymentBlockTimestamp: BigInt(r.pay_ts as string | number),
    }));
  }

  markWebhookDelivered(chainId: number, invoiceId: Hex): void {
    this.db
      .prepare(
        `UPDATE matches
         SET webhook_delivered_at = ?, webhook_attempts = webhook_attempts + 1,
             webhook_last_error = NULL
         WHERE chain_id = ? AND invoice_id = ?`,
      )
      .run(Date.now(), chainId, invoiceId);
  }

  markWebhookAttemptFailed(chainId: number, invoiceId: Hex, error: string): void {
    this.db
      .prepare(
        `UPDATE matches
         SET webhook_attempts = webhook_attempts + 1, webhook_last_error = ?
         WHERE chain_id = ? AND invoice_id = ?`,
      )
      .run(error.slice(0, 500), chainId, invoiceId);
  }

  /**
   * Per-merchant webhook destination, configured by the merchant from the
   * dashboard (Settings page) and written into the same DB file. Returns
   * null if the merchant hasn't set one up yet — the caller should skip
   * delivery without burning a retry attempt in that case.
   */
  getMerchantWebhook(chainId: number, merchant: Address): { url: string; secret: string } | null {
    const row = this.db
      .prepare(
        `SELECT webhook_url, webhook_secret FROM merchant_settings
         WHERE chain_id = ? AND LOWER(merchant) = LOWER(?)`,
      )
      .get(chainId, merchant) as
      | { webhook_url: string | null; webhook_secret: string | null }
      | undefined;
    if (!row || !row.webhook_url || !row.webhook_secret) return null;
    return { url: row.webhook_url, secret: row.webhook_secret };
  }

  close(): void {
    this.db.close();
  }
}

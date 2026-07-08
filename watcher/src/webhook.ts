import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Address } from 'viem';
import type { Store } from './db.ts';
import type { WebhookPolicy } from './config.ts';

/**
 * Deterministic event ID derived from (chainId, invoiceId, txHash, logIndex).
 * Same match → same event ID across delivery attempts and process restarts,
 * so downstream can dedupe on `evt.id`.
 */
export function eventIdFor(
  chainId: number,
  invoiceId: string,
  txHash: string,
  logIndex: number,
): string {
  const h = createHash('sha256')
    .update(`${chainId}:${invoiceId.toLowerCase()}:${txHash.toLowerCase()}:${logIndex}`)
    .digest('hex');
  return `evt_${h.slice(0, 32)}`;
}

interface PendingMatch {
  invoiceId: string;
  txHash: string;
  logIndex: number;
  tier: 1 | 2 | 3;
  confidence: number;
  evidence: string;
  attempts: number;
  createdAt: number;
  invoiceMerchant: string;
  invoiceToken: string;
  invoiceAmount: bigint;
  invoiceDueDate: bigint;
  paymentAmount: bigint;
  paymentFrom: string;
  paymentTo: string;
  paymentBlockNumber: bigint;
  paymentBlockTimestamp: bigint;
}

function buildPayload(chainId: number, m: PendingMatch): string {
  let parsedEvidence: unknown = m.evidence;
  try {
    parsedEvidence = JSON.parse(m.evidence);
  } catch {
    // Leave as string if it isn't valid JSON.
  }
  return JSON.stringify({
    id: eventIdFor(chainId, m.invoiceId, m.txHash, m.logIndex),
    type: 'payment.matched',
    created_at: new Date().toISOString(),
    data: {
      chain_id: chainId,
      invoice: {
        id: m.invoiceId,
        merchant: m.invoiceMerchant,
        token: m.invoiceToken,
        amount: m.invoiceAmount.toString(),
        due_date_unix: Number(m.invoiceDueDate),
      },
      payment: {
        tx_hash: m.txHash,
        log_index: m.logIndex,
        from: m.paymentFrom,
        to: m.paymentTo,
        amount: m.paymentAmount.toString(),
        block_number: Number(m.paymentBlockNumber),
        block_timestamp_unix: Number(m.paymentBlockTimestamp),
      },
      match: {
        tier: m.tier,
        confidence: m.confidence,
        evidence: parsedEvidence,
        matched_at_ms: m.createdAt,
      },
    },
  });
}

/**
 * Stripe-compatible signature: `t=<unix-ts>,v1=<hex-hmac-sha256>` over
 * the string `<unix-ts>.<raw-body>` with the shared secret.
 */
export function sign(body: string, secret: string, timestamp: number): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verify(body: string, header: string, secret: string, toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const idx = kv.indexOf('=');
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  let received: Buffer;
  try {
    received = Buffer.from(v1, 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}

async function deliverOne(
  m: PendingMatch,
  dest: { url: string; secret: string },
  policy: WebhookPolicy,
  chainId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = buildPayload(chainId, m);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(body, dest.secret, timestamp);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), policy.timeoutMs);
  try {
    const res = await fetch(dest.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recon-signature': signature,
        'x-recon-event-type': 'payment.matched',
      },
      body,
      signal: ctrl.signal,
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const text = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 200)}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runWebhookDispatch(
  store: Store,
  chainId: number,
  policy: WebhookPolicy,
): Promise<{ delivered: number; failed: number }> {
  const pending = store.matchesPendingWebhook(chainId, policy.maxAttempts, policy.maxPerTick);
  let delivered = 0;
  let failed = 0;

  for (const m of pending) {
    const dest = store.getMerchantWebhook(chainId, m.invoiceMerchant as Address);
    if (!dest) continue; // merchant hasn't configured a webhook yet — leave pending, don't burn a retry

    const res = await deliverOne(m as PendingMatch, dest, policy, chainId);
    if (res.ok) {
      store.markWebhookDelivered(chainId, m.invoiceId);
      delivered++;
      console.log(
        `[webhook] delivered invoice=${m.invoiceId} tier=${m.tier} attempt=${m.attempts + 1}`,
      );
    } else {
      store.markWebhookAttemptFailed(chainId, m.invoiceId, res.error);
      failed++;
      const remaining = policy.maxAttempts - (m.attempts + 1);
      console.warn(
        `[webhook] failed invoice=${m.invoiceId} attempt=${m.attempts + 1}/${policy.maxAttempts} error="${res.error}" ${
          remaining > 0 ? `(retrying next tick)` : `(gave up)`
        }`,
      );
    }
  }

  return { delivered, failed };
}

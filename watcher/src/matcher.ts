import type { InvoiceRow, Store } from './db.ts';
import type { Config } from './config.ts';
import type { Tier3Client } from './tier3.ts';

const TIER3_MAX_FAILURES = 3;

/**
 * Match open invoices to unmatched payments in two synchronous passes,
 * then optionally run a Tier 3 (LLM) pass over payments that couldn't
 * be resolved.
 *
 *   Pass 1 (Tier 1) — payment.reference == invoice.id.
 *     Runs first so reference-tagged payments are consumed before ambiguity is
 *     evaluated. Otherwise a plain payment sharing an amount with a
 *     reference-tagged one would trigger a false "ambiguous" skip.
 *
 *   Pass 2 (Tier 2) — exactly one unmatched payment with the invoice's
 *     (token, amount).
 *
 *   Pass 3 (Tier 3, optional) — for each remaining unmatched payment,
 *     ask Claude to pick from candidate open invoices (same token, amount
 *     within tolerance). Rate-capped per tick; each payment gets at most
 *     one Tier 3 attempt for its lifetime.
 */
export function matchOpenInvoices(store: Store, chainId: number): number {
  const invoices = store.openInvoices(chainId);
  let matched = 0;

  // Pass 1: Tier 1 (reference-in-calldata).
  const stillOpen: InvoiceRow[] = [];
  for (const inv of invoices) {
    const candidates = store.unmatchedPaymentsFor(chainId, inv.token, inv.amount, inv.merchant);
    const tier1 = candidates.find(
      (c) => c.reference && c.reference.toLowerCase() === inv.id.toLowerCase(),
    );
    if (tier1) {
      const ok = store.insertMatch({
        chainId,
        invoiceId: inv.id,
        txHash: tier1.txHash,
        logIndex: tier1.logIndex,
        tier: 1,
        confidence: 1.0,
        evidence: JSON.stringify({
          rule: 'reference-in-calldata',
          reference: tier1.reference,
          amount: inv.amount.toString(),
          token: inv.token,
        }),
      });
      if (ok > 0) {
        matched++;
        logMatch(inv, tier1, 1);
      }
    } else {
      stillOpen.push(inv);
    }
  }

  // Pass 2: Tier 2 (unique exact-amount, using payments still unmatched after pass 1).
  for (const inv of stillOpen) {
    const candidates = store.unmatchedPaymentsFor(chainId, inv.token, inv.amount, inv.merchant);
    if (candidates.length === 0) continue;
    if (candidates.length > 1) continue; // ambiguous — leave for Tier 3
    const only = candidates[0]!;
    const ok = store.insertMatch({
      chainId,
      invoiceId: inv.id,
      txHash: only.txHash,
      logIndex: only.logIndex,
      tier: 2,
      confidence: 0.9,
      evidence: JSON.stringify({
        rule: 'unique-exact-amount',
        amount: inv.amount.toString(),
        token: inv.token,
      }),
    });
    if (ok > 0) {
      matched++;
      logMatch(inv, only, 2);
    }
  }

  return matched;
}

/**
 * Run Tier 3 for up to cfg.tier3.maxPerTick unmatched payments. Each payment
 * gets exactly one lifetime attempt — success or fail, we set tier3_attempted_at
 * so we never re-ask about the same payment.
 */
export async function runTier3(
  store: Store,
  cfg: Config,
  llm: Tier3Client,
): Promise<{ evaluated: number; matched: number }> {
  const pending = store.paymentsPendingTier3(cfg.chainId, cfg.tier3.maxPerTick);
  let evaluated = 0;
  let matched = 0;

  for (const p of pending) {
    const candidates = store.candidateOpenInvoicesByToken(
      cfg.chainId,
      p.token,
      p.amount,
      cfg.tier3.toleranceBps,
      p.toAddr,
    );
    if (candidates.length === 0) {
      // Nothing to ask about. Still record the attempt so we don't retry forever.
      store.setTier3Decision(cfg.chainId, p.txHash, p.logIndex, {
        rule: 'no-candidates',
        toleranceBps: cfg.tier3.toleranceBps,
      });
      continue;
    }

    evaluated++;
    let decision;
    try {
      decision = await llm.decide(
        {
          txHash: p.txHash,
          token: p.token,
          amount: p.amount,
          fromAddr: p.fromAddr,
          blockTimestamp: p.blockTimestamp,
          reference: p.reference,
        },
        candidates.map((c) => ({
          id: c.id,
          amount: c.amount,
          token: c.token,
          dueDate: c.dueDate,
          merchant: c.merchant,
          createdAtBlock: c.createdAtBlock,
        })),
      );
    } catch (err) {
      const failCount = store.bumpTier3FailureCount(cfg.chainId, p.txHash, p.logIndex);
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tier3] payment tx=${p.txHash} failure ${failCount}/${TIER3_MAX_FAILURES}:`, msg);
      if (failCount >= TIER3_MAX_FAILURES) {
        // Give up. Record a terminal decision so we never re-ask.
        store.setTier3Decision(cfg.chainId, p.txHash, p.logIndex, {
          rule: 'gave-up-after-errors',
          failures: failCount,
          lastError: msg.slice(0, 200),
        });
      }
      continue;
    }

    store.setTier3Decision(cfg.chainId, p.txHash, p.logIndex, decision);

    const invoiceIdIsValid =
      decision.invoiceId !== null &&
      /^0x[0-9a-fA-F]{64}$/.test(decision.invoiceId) &&
      candidates.some((c) => c.id.toLowerCase() === decision.invoiceId!.toLowerCase());

    if (invoiceIdIsValid && decision.confidence >= cfg.tier3.minConfidence) {
      const matchedInvoice = candidates.find(
        (c) => c.id.toLowerCase() === decision.invoiceId!.toLowerCase(),
      )!;
      const ok = store.insertMatch({
        chainId: cfg.chainId,
        invoiceId: matchedInvoice.id,
        txHash: p.txHash,
        logIndex: p.logIndex,
        tier: 3,
        confidence: decision.confidence,
        evidence: JSON.stringify({
          rule: 'llm-fuzzy-match',
          model: cfg.tier3.model,
          reasoning: decision.reasoning,
          payment_amount: p.amount.toString(),
          invoice_amount: matchedInvoice.amount.toString(),
        }),
      });
      if (ok > 0) {
        matched++;
        console.log(
          `[matcher] tier=3 invoice=${matchedInvoice.id} conf=${decision.confidence.toFixed(2)} tx=${p.txHash} — "${decision.reasoning}"`,
        );
      }
    } else {
      console.log(
        `[tier3] no-match tx=${p.txHash} decision=${JSON.stringify({
          invoiceId: decision.invoiceId,
          confidence: decision.confidence,
        })} — "${decision.reasoning}"`,
      );
    }
  }

  return { evaluated, matched };
}

function logMatch(
  inv: InvoiceRow,
  payment: { txHash: string; blockNumber: bigint },
  tier: number,
): void {
  console.log(
    `[matcher] tier=${tier} invoice=${inv.id} amount=${inv.amount} tx=${payment.txHash} block=${payment.blockNumber}`,
  );
}

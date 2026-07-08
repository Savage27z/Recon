import OpenAI from 'openai';
import { z } from 'zod';
import type { Address, Hex } from 'viem';
import type { Tier3Config } from './config.ts';

export const DecisionSchema = z.object({
  invoiceId: z
    .string()
    .nullable()
    .describe(
      'The bytes32 hex invoice ID (0x…64 hex chars) that this payment funds, or null if no candidate is plausible.',
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Confidence 0-1. Use 0.9+ only when evidence is strong (exact amount + tight timing). Below 0.7 means the caller should treat this as unresolved.',
    ),
  reasoning: z
    .string()
    .describe('One or two sentences citing specific evidence (amount closeness, timing, payer, memo).'),
});

export type Tier3Decision = z.infer<typeof DecisionSchema>;

export interface PaymentInput {
  txHash: Hex;
  token: Address;
  amount: bigint;
  fromAddr: Address;
  blockTimestamp: bigint;
  reference: Hex | null;
}

export interface CandidateInput {
  id: Hex;
  amount: bigint;
  token: Address;
  dueDate: bigint;
  merchant: Address;
  createdAtBlock: bigint;
}

function fmt6(raw: bigint): string {
  const s = raw.toString().padStart(7, '0');
  return `${s.slice(0, -6)}.${s.slice(-6)}`;
}

function deltaPct(payment: bigint, invoice: bigint): number {
  if (invoice === 0n) return Infinity;
  const diff = payment > invoice ? payment - invoice : invoice - payment;
  return Number((diff * 10_000n) / invoice) / 100;
}

export interface Tier3Client {
  decide(payment: PaymentInput, candidates: CandidateInput[]): Promise<Tier3Decision>;
}

/**
 * OpenAI-compatible Tier 3 client. Works with any provider that speaks the
 * chat.completions surface (BTL/DeepSeek, OpenAI, Together, etc.).
 * Structured output via `response_format: { type: "json_object" }` + Zod
 * validation on the returned text.
 */
export class OpenAITier3Client implements Tier3Client {
  private client: OpenAI;
  constructor(private cfg: Tier3Config) {
    if (!cfg.apiKey) throw new Error('OpenAITier3Client requires an API key');
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    });
  }

  async decide(payment: PaymentInput, candidates: CandidateInput[]): Promise<Tier3Decision> {
    const paymentDesc = {
      token: payment.token,
      amount_raw: payment.amount.toString(),
      amount_6dp: fmt6(payment.amount),
      from: payment.fromAddr,
      block_timestamp_unix: Number(payment.blockTimestamp),
      block_timestamp_iso: new Date(Number(payment.blockTimestamp) * 1000).toISOString(),
      tx_hash: payment.txHash,
      calldata_reference: payment.reference,
    };
    const candidatesDesc = candidates.map((inv) => ({
      invoice_id: inv.id,
      amount_raw: inv.amount.toString(),
      amount_6dp: fmt6(inv.amount),
      token: inv.token,
      due_date_unix: Number(inv.dueDate),
      due_date_iso: inv.dueDate > 0n ? new Date(Number(inv.dueDate) * 1000).toISOString() : 'unset',
      merchant: inv.merchant,
      created_at_block: Number(inv.createdAtBlock),
      delta_from_payment_pct: deltaPct(payment.amount, inv.amount),
    }));

    const system = `You are a payment reconciliation assistant for a merchant tool.
Given one incoming stablecoin payment and a list of the merchant's open invoices,
decide which invoice (if any) this payment funds.

Rules:
- Prefer exact amount matches. Deltas < 1% may indicate rounding or fees and are acceptable evidence.
- Deltas > 5% are suspicious — return invoiceId: null unless another signal is very strong.
- If more than one candidate is equally plausible, return invoiceId: null. Do not guess.
- The calldata_reference field, if not null, is a 32-byte hex value the payer may have embedded. If it matches an invoice_id, that's decisive — but Tier 1 already handles that case, so treat non-exact calldata_reference as weak evidence at best.
- Confidence should reflect uncertainty. 0.9+ = near-certain. 0.7-0.9 = high confidence with minor uncertainty. < 0.7 = the caller should treat this as unresolved.
- Return the invoice_id exactly as given (bytes32 hex, 0x-prefixed, lowercase).

Respond with a single JSON object matching this schema (no prose, no markdown fences):
{
  "invoiceId": string | null,   // one of the candidate invoice_ids, or null
  "confidence": number,          // 0.0 to 1.0
  "reasoning": string            // 1-2 sentences citing specific evidence
}`;

    const user =
      `Payment received:\n${JSON.stringify(paymentDesc, null, 2)}\n\n` +
      `Candidate open invoices (same token, amount within tolerance):\n${JSON.stringify(candidatesDesc, null, 2)}\n\n` +
      `Decide which invoice this payment funds, or null if no candidate is plausible. Return only JSON.`;

    const response = await this.client.chat.completions.create({
      model: this.cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('LLM returned empty content');

    // Strip accidental markdown fences.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
    }
    return DecisionSchema.parse(parsed);
  }
}

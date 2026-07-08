// Tier 3 tests with a mocked Tier3Client — no chain, no LLM cost.
import { Store } from './db.ts';
import { runTier3 } from './matcher.ts';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHAIN = 133;
const TOKEN = '0x42d77Bb3aeC7C1f4df2ffc9Cce3e5C3F5Ec39D65';
const MERCHANT = '0xB155A22500C7893AF0c7FA0AB6e28d565C4fE1aA';

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'recon-tier3-'));
  return new Store(join(dir, 'test.db'));
}

function seedInvoice(store, id, amount) {
  store.upsertInvoice({
    chainId: CHAIN, id, merchant: MERCHANT, token: TOKEN, amount,
    dueDate: 0n, createdAtBlock: 1n, createdAtTx: '0x' + '0'.repeat(64),
  });
}

function seedPayment(store, tx, amount, reference = null) {
  store.insertPayments([{
    chainId: CHAIN, token: TOKEN, fromAddr: '0x' + '1'.repeat(40), toAddr: MERCHANT,
    amount, blockNumber: 1n, blockTimestamp: 0n, txHash: tx, logIndex: 0,
    reference,
  }]);
}

function mockLLM(scriptFn) {
  return {
    calls: [],
    async decide(payment, candidates) {
      this.calls.push({ payment: { ...payment }, candidates: candidates.map((c) => c.id) });
      return scriptFn(payment, candidates, this.calls.length - 1);
    },
  };
}

function cfg(overrides = {}) {
  return {
    chainId: CHAIN,
    tier3: {
      enabled: true,
      apiKey: 'test',
      baseUrl: 'x',
      model: 'test-model',
      minConfidence: 0.7,
      toleranceBps: 500,
      maxPerTick: 10,
      ...overrides,
    },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('valid match: LLM picks a real candidate with high confidence', async () => {
  const store = freshStore();
  const invA = '0x' + 'aa'.repeat(32);
  seedInvoice(store, invA, 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n); // 2% under, within tolerance
  const llm = mockLLM(() => ({ invoiceId: invA, confidence: 0.9, reasoning: 'ok' }));
  const res = await runTier3(store, cfg(), llm);
  assert.equal(res.evaluated, 1);
  assert.equal(res.matched, 1);
  assert.equal(store.openInvoices(CHAIN).length, 0);
});

test('null decision: no match, but attempt recorded', async () => {
  const store = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => ({ invoiceId: null, confidence: 0, reasoning: 'no signal' }));
  const res = await runTier3(store, cfg(), llm);
  assert.equal(res.matched, 0);
  assert.equal(store.paymentsPendingTier3(CHAIN, 10).length, 0, 'should be marked attempted');
});

test('hallucinated invoiceId (not in candidates): no match', async () => {
  const store = freshStore();
  const real = '0x' + 'aa'.repeat(32);
  const fake = '0x' + 'ff'.repeat(32);
  seedInvoice(store, real, 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => ({ invoiceId: fake, confidence: 0.99, reasoning: 'hallucinated' }));
  const res = await runTier3(store, cfg(), llm);
  assert.equal(res.matched, 0);
  assert.equal(store.openInvoices(CHAIN).length, 1);
});

test('malformed hex invoiceId: no match', async () => {
  const store = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => ({ invoiceId: 'not-hex', confidence: 0.99, reasoning: '' }));
  const res = await runTier3(store, cfg(), llm);
  assert.equal(res.matched, 0);
});

test('low confidence below threshold: decision recorded, no match', async () => {
  const store = freshStore();
  const invA = '0x' + 'aa'.repeat(32);
  seedInvoice(store, invA, 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => ({ invoiceId: invA, confidence: 0.5, reasoning: 'unsure' }));
  const res = await runTier3(store, cfg({ minConfidence: 0.7 }), llm);
  assert.equal(res.matched, 0);
  assert.equal(store.paymentsPendingTier3(CHAIN, 10).length, 0);
});

test('no candidates within tolerance: no LLM call, attempt recorded', async () => {
  const store = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 200n); // 100% off — outside 5% tolerance
  const llm = mockLLM(() => { throw new Error('LLM should not be called'); });
  const res = await runTier3(store, cfg(), llm);
  assert.equal(res.evaluated, 0);
  assert.equal(llm.calls.length, 0);
  assert.equal(store.paymentsPendingTier3(CHAIN, 10).length, 0);
});

test('maxPerTick caps LLM calls', async () => {
  const store = freshStore();
  const invA = '0x' + 'aa'.repeat(32);
  seedInvoice(store, invA, 100n);
  for (let i = 0; i < 10; i++) {
    const tx = '0x' + i.toString(16).padStart(64, '0');
    seedPayment(store, tx, 100n);
  }
  const llm = mockLLM(() => ({ invoiceId: null, confidence: 0, reasoning: 'x' }));
  const res = await runTier3(store, cfg({ maxPerTick: 3 }), llm);
  assert.equal(llm.calls.length, 3, 'exactly maxPerTick calls');
  assert.equal(res.evaluated, 3);
  assert.equal(store.paymentsPendingTier3(CHAIN, 100).length, 10 - 3, '7 payments still pending');
});

test('previously attempted payments not re-queried', async () => {
  const store = freshStore();
  const invA = '0x' + 'aa'.repeat(32);
  seedInvoice(store, invA, 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => ({ invoiceId: null, confidence: 0, reasoning: 'x' }));
  await runTier3(store, cfg(), llm);
  assert.equal(llm.calls.length, 1);
  await runTier3(store, cfg(), llm);
  assert.equal(llm.calls.length, 1, 'second run should not re-call');
});

test('transient errors retry, then give up after N failures', async () => {
  const store = freshStore();
  const invA = '0x' + 'aa'.repeat(32);
  seedInvoice(store, invA, 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 98n);
  const llm = mockLLM(() => { throw new Error('BOOM'); });
  // 3 ticks of failure — after tick 3, should be marked attempted with terminal decision.
  await runTier3(store, cfg(), llm);
  await runTier3(store, cfg(), llm);
  assert.equal(store.paymentsPendingTier3(CHAIN, 10).length, 1, 'still pending after 2 failures');
  await runTier3(store, cfg(), llm);
  assert.equal(store.paymentsPendingTier3(CHAIN, 10).length, 0, 'given up after 3 failures');
  // 4th tick should NOT call LLM again.
  const before = llm.calls.length;
  await runTier3(store, cfg(), llm);
  assert.equal(llm.calls.length, before, 'no more LLM calls after give-up');
});

test('candidate lookup respects tolerance boundary', async () => {
  const store = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n); // within 5% of 95
  seedInvoice(store, '0x' + 'bb'.repeat(32), 200n); // outside 5% of 95
  // For amount 95, 5% tolerance = ±4.75, so range is [91, 99] (integer math via bps).
  // 100 is outside (delta 5%, exactly at the boundary but integer bps rounding).
  const candidates = store.candidateOpenInvoicesByToken(CHAIN, TOKEN, 95n, 500);
  const ids = candidates.map((c) => c.id);
  assert.ok(!ids.includes('0x' + 'bb'.repeat(32)), '200 should not be a candidate for 95');
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`  ok  ${t.name}`); pass++; }
  catch (e) { console.log(`  FAIL ${t.name}: ${e.message}`); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

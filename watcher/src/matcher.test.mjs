// Matcher tests using a real in-memory SQLite via Store — no chain access.
import { Store } from './db.ts';
import { matchOpenInvoices } from './matcher.ts';
import assert from 'node:assert/strict';
import { unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHAIN = 133;
const TOKEN = '0x42d77Bb3aeC7C1f4df2ffc9Cce3e5C3F5Ec39D65';
const OTHER_TOKEN = '0x0000000000000000000000000000000000000001';
const MERCHANT = '0xB155A22500C7893AF0c7FA0AB6e28d565C4fE1aA';

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'recon-matcher-'));
  return { store: new Store(join(dir, 'test.db')), dir };
}

function seedInvoice(store, id, amount) {
  store.upsertInvoice({
    chainId: CHAIN, id, merchant: MERCHANT, token: TOKEN, amount,
    dueDate: 0n, createdAtBlock: 1n, createdAtTx: '0x' + '0'.repeat(64),
  });
}

function seedPayment(store, tx, amount, reference = null, token = TOKEN) {
  store.insertPayments([{
    chainId: CHAIN, token, fromAddr: '0x' + '1'.repeat(40), toAddr: MERCHANT,
    amount, blockNumber: 1n, blockTimestamp: 0n, txHash: tx, logIndex: 0,
    reference,
  }]);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('Tier 2 unique amount: 1 invoice + 1 exact payment → matches', () => {
  const { store } = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 1);
  assert.equal(store.openInvoices(CHAIN).length, 0, 'invoice should flip to matched');
});

test('Tier 1 wins over Tier 2 when reference present', () => {
  const { store } = freshStore();
  const id = '0x' + 'aa'.repeat(32);
  seedInvoice(store, id, 100n);
  seedPayment(store, '0x' + 'c1'.repeat(32), 100n, id);
  assert.equal(matchOpenInvoices(store, CHAIN), 1);
});

test('Ambiguous Tier 2 (>1 payments) does NOT match', () => {
  const { store } = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'd1'.repeat(32), 100n);
  seedPayment(store, '0x' + 'd2'.repeat(32), 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 0);
  assert.equal(store.openInvoices(CHAIN).length, 1, 'invoice stays open');
});

test('Ambiguous amount + reference resolves for the right invoice', () => {
  const { store } = freshStore();
  const id1 = '0x' + 'aa'.repeat(32);
  const id2 = '0x' + 'bb'.repeat(32);
  seedInvoice(store, id1, 100n);
  seedInvoice(store, id2, 100n);
  seedPayment(store, '0x' + 'e1'.repeat(32), 100n, id2); // targeted at id2
  seedPayment(store, '0x' + 'e2'.repeat(32), 100n);       // plain
  const matched = matchOpenInvoices(store, CHAIN);
  assert.equal(matched, 2, 'both should match: id2 by Tier1, id1 by Tier2 leftover');
  assert.equal(store.openInvoices(CHAIN).length, 0);
});

test('Different token does NOT match same-amount invoice', () => {
  const { store } = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'f1'.repeat(32), 100n, null, OTHER_TOKEN);
  assert.equal(matchOpenInvoices(store, CHAIN), 0);
});

test('Zero candidates: matcher is a no-op, invoice stays open', () => {
  const { store } = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 0);
  assert.equal(store.openInvoices(CHAIN).length, 1);
});

test('Idempotent: rerunning matcher does not double-insert', () => {
  const { store } = freshStore();
  seedInvoice(store, '0x' + 'aa'.repeat(32), 100n);
  seedPayment(store, '0x' + 'b1'.repeat(32), 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 1);
  assert.equal(matchOpenInvoices(store, CHAIN), 0, 'second call must be no-op');
});

test('Payment already matched: not reused for another invoice', () => {
  const { store } = freshStore();
  const id1 = '0x' + 'aa'.repeat(32);
  const id2 = '0x' + 'bb'.repeat(32);
  seedInvoice(store, id1, 100n);
  seedPayment(store, '0x' + 'g1'.repeat(32), 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 1);

  // Now add a second invoice with same amount; only unmatched payments should count.
  seedInvoice(store, id2, 100n);
  assert.equal(matchOpenInvoices(store, CHAIN), 0);
  assert.equal(store.openInvoices(CHAIN).length, 1);
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  ok  ${t.name}`); pass++; }
  catch (e) { console.log(`  FAIL ${t.name}: ${e.message}`); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

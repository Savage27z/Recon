import { sign, verify, eventIdFor } from './webhook.ts';
import assert from 'node:assert/strict';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SECRET = 'whsec_test_key';
const BODY = '{"hello":"world","num":42}';

test('sign + verify roundtrip', () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign(BODY, SECRET, ts);
  assert.ok(header.startsWith('t=') && header.includes(',v1='));
  assert.equal(verify(BODY, header, SECRET), true);
});

test('verify rejects wrong secret', () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign(BODY, SECRET, ts);
  assert.equal(verify(BODY, header, 'wrong-secret'), false);
});

test('verify rejects modified body', () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign(BODY, SECRET, ts);
  assert.equal(verify('{"hello":"tampered"}', header, SECRET), false);
});

test('verify rejects stale timestamp (>5min)', () => {
  const ts = Math.floor(Date.now() / 1000) - 400; // 6.7 min old
  const header = sign(BODY, SECRET, ts);
  assert.equal(verify(BODY, header, SECRET), false);
});

test('verify rejects future timestamp (>5min)', () => {
  const ts = Math.floor(Date.now() / 1000) + 400;
  const header = sign(BODY, SECRET, ts);
  assert.equal(verify(BODY, header, SECRET), false);
});

test('verify rejects malformed header (no v1)', () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verify(BODY, `t=${ts}`, SECRET), false);
});

test('verify rejects malformed header (no t)', () => {
  assert.equal(verify(BODY, 'v1=abc123', SECRET), false);
});

test('verify rejects malformed header (bad hex in v1)', () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verify(BODY, `t=${ts},v1=nothex`, SECRET), false);
});

test('verify: empty body still validates', () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign('', SECRET, ts);
  assert.equal(verify('', header, SECRET), true);
});

test('eventIdFor is deterministic across calls', () => {
  const id1 = eventIdFor(133, '0xaa', '0xbb', 0);
  const id2 = eventIdFor(133, '0xaa', '0xbb', 0);
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('evt_'));
});

test('eventIdFor is case-insensitive on hex', () => {
  const lower = eventIdFor(133, '0xaabb', '0xccdd', 0);
  const upper = eventIdFor(133, '0xAABB', '0xCCDD', 0);
  assert.equal(lower, upper);
});

test('eventIdFor differs for different chains', () => {
  assert.notEqual(eventIdFor(1, '0xaa', '0xbb', 0), eventIdFor(133, '0xaa', '0xbb', 0));
});

test('eventIdFor differs for different logIndex', () => {
  assert.notEqual(eventIdFor(133, '0xaa', '0xbb', 0), eventIdFor(133, '0xaa', '0xbb', 1));
});

test('signature is different for different bodies', () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.notEqual(sign('{"a":1}', SECRET, ts), sign('{"a":2}', SECRET, ts));
});

test('signature is different for different timestamps', () => {
  const s1 = sign(BODY, SECRET, 1000);
  const s2 = sign(BODY, SECRET, 1001);
  assert.notEqual(s1, s2);
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  ok  ${t.name}`); pass++; }
  catch (e) { console.log(`  FAIL ${t.name}: ${e.message}`); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// Unit tests for extractReference. Runs via `node --import tsx src/reference.test.mjs`.
import { extractReference } from './reference.ts';
import assert from 'node:assert/strict';

const REF32 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REF32_BARE = REF32.slice(2);

const TRANSFER = '0xa9059cbb';
const TRANSFER_FROM = '0x23b872dd';
const ADDR_PADDED = '0'.repeat(24) + 'b155a22500c7893af0c7fa0ab6e28d565c4fe1aa';
const AMT_PADDED = '0'.repeat(58) + '2540be400'; // 10_000_000_000

const cases = [
  {
    name: 'undefined input',
    input: undefined,
    want: null,
  },
  {
    name: 'empty string',
    input: '0x',
    want: null,
  },
  {
    name: 'unknown selector',
    input: '0xdeadbeef' + '00'.repeat(200),
    want: null,
  },
  {
    name: 'plain transfer, no tail',
    input: TRANSFER + ADDR_PADDED + AMT_PADDED,
    want: null,
  },
  {
    name: 'transfer + 32-byte tail',
    input: TRANSFER + ADDR_PADDED + AMT_PADDED + REF32_BARE,
    want: REF32,
  },
  {
    name: 'transfer + 14-byte tail (malformed, must reject)',
    input: TRANSFER + ADDR_PADDED + AMT_PADDED + '00'.repeat(14),
    want: null,
  },
  {
    name: 'transfer + 64-byte tail (take LAST 32)',
    input: TRANSFER + ADDR_PADDED + AMT_PADDED + '00'.repeat(32) + REF32_BARE,
    want: REF32,
  },
  {
    name: 'transferFrom + 32-byte tail',
    input: TRANSFER_FROM + ADDR_PADDED + ADDR_PADDED + AMT_PADDED + REF32_BARE,
    want: REF32,
  },
  {
    name: 'transferFrom, no tail',
    input: TRANSFER_FROM + ADDR_PADDED + ADDR_PADDED + AMT_PADDED,
    want: null,
  },
  {
    name: 'mixed-case selector normalises',
    input: '0xA9059CBB' + ADDR_PADDED + AMT_PADDED + REF32_BARE.toUpperCase(),
    want: REF32,
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  try {
    const got = extractReference(c.input);
    assert.equal(got, c.want, `${c.name}: got ${got}, want ${c.want}`);
    console.log(`  ok  ${c.name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${c.name}: ${e.message}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

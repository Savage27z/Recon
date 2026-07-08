import { NextRequest, NextResponse } from 'next/server';
import { recoverMessageAddress } from 'viem';
import { getSession } from '@/lib/auth-session';
import { parseSiweMessage } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

const CHAIN_ID = Number(process.env['RECON_CHAIN_ID'] ?? 133);
const MAX_AGE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { message, signature } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const fields = parseSiweMessage(message);
  if (!fields) {
    return NextResponse.json({ error: 'malformed_message' }, { status: 400 });
  }
  if (fields.chainId !== CHAIN_ID) {
    return NextResponse.json({ error: 'wrong_chain' }, { status: 400 });
  }
  const issuedAtMs = Date.parse(fields.issuedAt);
  if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > MAX_AGE_MS) {
    return NextResponse.json({ error: 'message_expired' }, { status: 400 });
  }

  const session = await getSession();
  if (!session.nonce || session.nonce !== fields.nonce) {
    return NextResponse.json({ error: 'invalid_nonce' }, { status: 400 });
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  if (recovered.toLowerCase() !== fields.address.toLowerCase()) {
    return NextResponse.json({ error: 'signature_mismatch' }, { status: 400 });
  }

  session.nonce = undefined;
  session.merchant = recovered;
  await session.save();

  return NextResponse.json({ ok: true, merchant: recovered });
}

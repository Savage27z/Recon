import { NextRequest, NextResponse } from 'next/server';
import { decideMatch } from '@/lib/db';
import { getMerchantAddress } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { invoiceId, txHash, decision } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof invoiceId !== 'string' ||
    typeof txHash !== 'string' ||
    (decision !== 'approved' && decision !== 'rejected')
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const merchant = await getMerchantAddress();
  if (!merchant) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  try {
    decideMatch(merchant, invoiceId, txHash, decision);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/review] decideMatch failed:', message);
    return NextResponse.json(
      { error: 'internal_error', message: message.slice(0, 200) },
      { status: 500 },
    );
  }
}

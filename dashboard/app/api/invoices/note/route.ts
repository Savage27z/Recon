import { NextRequest, NextResponse } from 'next/server';
import { setInvoiceNote } from '@/lib/db';
import { getMerchantAddress } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { invoiceId, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof invoiceId !== 'string' || typeof note !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const merchant = await getMerchantAddress();
  if (!merchant) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const ok = setInvoiceNote(merchant, invoiceId, note);
    if (!ok) return NextResponse.json({ error: 'not_owner' }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/invoices/note] setInvoiceNote failed:', message);
    return NextResponse.json(
      { error: 'internal_error', message: message.slice(0, 200) },
      { status: 500 },
    );
  }
}

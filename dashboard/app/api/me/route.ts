import { NextResponse } from 'next/server';
import { getMerchantAddress } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const merchant = await getMerchantAddress();
  if (!merchant) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({ merchant });
}

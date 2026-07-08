import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  const nonce = randomBytes(16).toString('hex');
  session.nonce = nonce;
  await session.save();
  return NextResponse.json({ nonce });
}

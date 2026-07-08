import { NextRequest, NextResponse } from 'next/server';
import { safeJson } from '@/lib/api';
import { getWebhookSettings, setWebhookSettings } from '@/lib/db';
import { getMerchantAddress } from '@/lib/session';
import { isSafeWebhookUrl } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

export async function GET() {
  const merchant = await getMerchantAddress();
  if (!merchant) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return safeJson(() => getWebhookSettings(merchant) ?? { url: '', secret: '' });
}

export async function POST(req: NextRequest) {
  const merchant = await getMerchantAddress();
  if (!merchant) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { url, secret } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== 'string' || typeof secret !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (url.length > 0) {
    if (!(await isSafeWebhookUrl(url))) {
      return NextResponse.json(
        { error: 'unsafe_url', message: 'Webhook URL must be a public http(s) address' },
        { status: 400 },
      );
    }
    if (secret.length < 16) {
      return NextResponse.json(
        { error: 'secret_too_short', message: 'Secret must be at least 16 characters' },
        { status: 400 },
      );
    }
  }

  return safeJson(() => {
    setWebhookSettings(merchant, url, secret);
    return { ok: true };
  });
}

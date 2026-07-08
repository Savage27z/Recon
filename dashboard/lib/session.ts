import { getSession } from '@/lib/auth-session';

const DEV_FALLBACK =
  process.env.NODE_ENV !== 'production' ? process.env['RECON_DEV_MERCHANT'] : undefined;

/**
 * The signed-in merchant's address, or null if there is no valid session.
 * Callers must treat null as unauthenticated and refuse to serve data.
 */
export async function getMerchantAddress(): Promise<string | null> {
  const session = await getSession();
  return session.merchant ?? DEV_FALLBACK ?? null;
}

import { cookies } from 'next/headers';
import { getIronSession, type IronSession } from 'iron-session';

export interface SessionData {
  nonce?: string;
  merchant?: string;
}

const envSecret = process.env['SESSION_SECRET'];
if (!envSecret || envSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a string of at least 32 characters');
}
const password: string = envSecret;

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    cookieName: 'recon_session',
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
}

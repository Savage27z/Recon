import { NextResponse } from 'next/server';

/**
 * Wrap a route handler so DB / SQL errors become graceful 500s instead of
 * leaking a full Next.js error page to the caller. Logs the error server-side
 * so we can still diagnose from `next dev` output.
 */
export function safeJson<T>(fn: () => T): Response {
  try {
    return NextResponse.json(fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api] handler failed:', message);
    return NextResponse.json(
      { error: 'internal_error', message: message.slice(0, 200) },
      { status: 500 },
    );
  }
}

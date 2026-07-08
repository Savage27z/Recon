import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true; // loopback / unspecified
  if (norm.startsWith('fe80:')) return true; // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique local fc00::/7
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]!);
  return false;
}

function ipBlocked(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Blocked(ip);
  if (version === 6) return ipv6Blocked(ip);
  return true; // not a recognizable IP — treat conservatively as blocked
}

/**
 * Rejects webhook destinations that would let a merchant make the watcher
 * process fetch internal/private infrastructure (SSRF) — loopback, RFC1918,
 * link-local (including the 169.254.169.254 cloud metadata address), and
 * bare IP literals in those ranges. Hostnames are resolved and every
 * returned address is checked; this doesn't fully close DNS-rebinding
 * (the watcher re-resolves at fetch time) but blocks the common case.
 */
export async function isSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const hostname = url.hostname;
  if (hostname === 'localhost') return false;

  if (isIP(hostname)) return !ipBlocked(hostname);

  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !ipBlocked(r.address));
  } catch {
    return false;
  }
}

// Local webhook receiver for smoke tests. Verifies HMAC signature and logs
// events. Behavior modes via env:
//   MODE=ok           always 200
//   MODE=fail         always 500 (used to test give-up)
//   MODE=flap         first 2 attempts fail, then 200 (used to test retry)
//   MODE=slow         200 but takes 8s (used to test timeout)
import http from 'node:http';
import { verify } from './webhook.ts';

const PORT = Number(process.env.PORT ?? 9999);
const SECRET = process.env.WEBHOOK_SECRET ?? '';
const MODE = process.env.MODE ?? 'ok';

const state = { seenIds: new Set(), attemptsByInvoice: new Map(), events: [] };

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.statusCode = 404;
    return res.end();
  }
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  const sigHeader = req.headers['x-recon-signature'];
  if (typeof sigHeader !== 'string') {
    console.log('[receiver] missing signature header');
    res.statusCode = 400;
    return res.end('missing signature');
  }
  if (!verify(body, sigHeader, SECRET)) {
    console.log('[receiver] BAD SIGNATURE — rejecting');
    res.statusCode = 401;
    return res.end('bad signature');
  }

  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = { id: '?', type: '?' }; }
  const invoiceId = parsed?.data?.invoice?.id ?? '?';
  const attempt = (state.attemptsByInvoice.get(invoiceId) ?? 0) + 1;
  state.attemptsByInvoice.set(invoiceId, attempt);

  if (state.seenIds.has(parsed.id)) {
    console.log(`[receiver] DUPLICATE event id=${parsed.id}`);
  }
  state.seenIds.add(parsed.id);
  state.events.push({ event: parsed.id, invoiceId, attempt, mode: MODE });

  console.log(
    `[receiver] valid sig event=${parsed.id} type=${parsed.type} invoice=${invoiceId.slice(0, 10)}... attempt=${attempt}`,
  );

  if (MODE === 'fail') {
    res.statusCode = 500;
    return res.end('nope');
  }
  if (MODE === 'flap') {
    if (attempt < 3) {
      res.statusCode = 500;
      return res.end('flapping');
    }
  }
  if (MODE === 'slow') {
    await new Promise((r) => setTimeout(r, 8000));
  }
  res.statusCode = 200;
  res.end('{}');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[receiver] listening on 127.0.0.1:${PORT} MODE=${MODE}`);
});

// Dump state on SIGINT.
process.on('SIGINT', () => {
  console.log(`[receiver] summary: events=${state.events.length}`);
  for (const e of state.events) console.log(' ', e);
  process.exit(0);
});

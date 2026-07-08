'use client';

import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/db';

export function LiveFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetch('/api/feed', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as FeedItem[];
      if (!cancelled) setItems(j);
    };
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="bg-dark rounded-[18px] p-[22px] text-inkInverse">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-[7px] h-[7px] rounded-full bg-green" />
        <h2 className="text-[14px] font-extrabold m-0">Live feed</h2>
      </div>
      <div className="flex flex-col gap-[10px] max-h-[340px] overflow-hidden">
        {items === null ? (
          <div className="text-darkMuted text-[12px]">loading…</div>
        ) : items.length === 0 ? (
          <div className="text-darkMuted text-[12px]">No payments yet.</div>
        ) : (
          items.map((f) => (
            <div
              key={f.txHash}
              className="bg-white/[.05] rounded-[10px] py-[11px] px-[13px] animate-reconRowIn"
            >
              <div className="flex justify-between mb-1">
                <span className="font-bold text-[13px]">
                  {f.amount6dp} → {f.invoice}
                </span>
                <span
                  className="text-[11px] font-extrabold"
                  style={{ color: f.tierColor }}
                >
                  {f.tierLabel}
                </span>
              </div>
              <div className="text-[11px] text-darkMuted font-mono">
                {f.wallet} · {f.ageLabel}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { MatchRow } from '@/lib/db';

export function MatchesTable({ title = 'Recent matches' }: { title?: string }) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetch('/api/matches', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as MatchRow[];
      if (!cancelled) setRows(j);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="bg-card border border-border rounded-[18px] p-4 md:p-6">
      <h2 className="text-[16px] font-extrabold m-0 mb-[18px]">{title}</h2>
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-5 gap-2 text-[12px] font-bold text-muted px-1 pb-3 border-b border-border">
            <div>Invoice</div>
            <div>Amount</div>
            <div>Wallet</div>
            <div>Tier</div>
            <div>Time</div>
          </div>
          {rows === null ? (
            <div className="text-[13px] text-muted py-6">loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-muted py-6">No matches yet.</div>
          ) : (
            rows.map((m) => (
              <div
                key={m.invoiceId}
                className="grid grid-cols-5 gap-2 text-[13.5px] py-[14px] px-1 border-b border-borderSoft items-center"
              >
                <div className="font-bold">{m.invoiceShort}</div>
                <div>{m.amount6dp}</div>
                <div className="font-mono text-muted text-[12.5px]">{m.wallet}</div>
                <div>
                  <span
                    className="font-extrabold text-[11.5px] px-[10px] py-1 rounded-full"
                    style={{ background: m.tierBg, color: m.tierFg }}
                  >
                    {m.tierLabel}
                  </span>
                </div>
                <div className="text-muted">{m.ageLabel}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

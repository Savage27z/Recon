'use client';

import { useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import type { InvoiceRow } from '@/lib/db';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#FDF3EC', fg: '#B9603A' },
  matched: { bg: '#FFF6DA', fg: '#B8860B' },
  paid: { bg: '#E9F6D9', fg: '#3F9600' },
};

export interface InvoicesTableHandle {
  refresh(): void;
}

export const InvoicesTable = forwardRef<InvoicesTableHandle>(function InvoicesTable(_props, ref) {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/invoices', { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as InvoiceRow[];
    setRows(j);
  }, []);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="bg-card border border-border rounded-[18px] p-4 md:p-6">
      <h2 className="text-[16px] font-extrabold m-0 mb-[18px]">All invoices</h2>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-5 gap-2 text-[12px] font-bold text-muted px-1 pb-3 border-b border-border">
            <div>Invoice</div>
            <div>Amount</div>
            <div>Token</div>
            <div>Due</div>
            <div>Status</div>
          </div>
          {rows === null ? (
            <div className="text-[13px] text-muted py-6">loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-muted py-6">No invoices yet.</div>
          ) : (
            rows.map((inv) => {
              const style = STATUS_STYLE[inv.status] ?? STATUS_STYLE.open!;
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-5 gap-2 text-[13.5px] py-[14px] px-1 border-b border-borderSoft items-center"
                >
                  <div>
                    <div className="font-bold">{inv.idShort}</div>
                    {inv.note ? (
                      <div className="text-muted text-[11.5px] truncate max-w-[180px]">{inv.note}</div>
                    ) : null}
                  </div>
                  <div>{inv.amount6dp}</div>
                  <div className="font-mono text-muted text-[12.5px]">{inv.tokenShort}</div>
                  <div className="text-muted">{inv.dueDateLabel}</div>
                  <div>
                    <span
                      className="font-extrabold text-[11.5px] px-[10px] py-1 rounded-full"
                      style={{ background: style.bg, color: style.fg }}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

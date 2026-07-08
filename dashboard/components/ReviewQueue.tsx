'use client';

import { useEffect, useState } from 'react';
import type { QueueItem } from '@/lib/db';

export function ReviewQueue({
  variant = 'card',
}: {
  variant?: 'card' | 'panel';
}) {
  const [items, setItems] = useState<QueueItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetch('/api/queue', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as QueueItem[];
      if (!cancelled) setItems(j);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const wrapCls =
    variant === 'panel'
      ? 'bg-card border border-border rounded-[18px] p-6 max-w-[760px]'
      : 'bg-card border border-border rounded-[18px] p-6';

  return (
    <div className={wrapCls}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-[16px] font-extrabold m-0">Review queue</h2>
        <span className="text-[12px] font-bold text-muted">
          {items === null ? 'loading' : `${items.length} pending`}
        </span>
      </div>

      {items === null ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <div className="text-[28px] mb-[10px]">✓</div>
          <div className="font-bold text-[14px]">Queue clear. Nice work.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((q) => (
            <QueueRow key={`${q.invoiceId}:${q.txHash}`} item={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const [state, setState] = useState<'idle' | 'approving' | 'rejecting' | 'gone'>('idle');
  if (state === 'gone') return null;

  const exit = state === 'approving' || state === 'rejecting' ? 'opacity-40' : '';

  const act = async (action: 'approve' | 'reject') => {
    setState(action === 'approve' ? 'approving' : 'rejecting');
    try {
      const r = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: item.invoiceId,
          txHash: item.txHash,
          decision: action === 'approve' ? 'approved' : 'rejected',
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setState('gone');
    } catch {
      setState('idle');
    }
  };

  return (
    <div className={`border border-border rounded-[14px] p-4 px-[18px] transition-opacity ${exit}`}>
      <div className="flex justify-between items-center mb-[10px]">
        <div className="flex items-center gap-[10px]">
          <span className="font-extrabold text-[15px]">{item.paymentAmount6dp}</span>
          <span className="text-mutedSoft">→</span>
          <span className="font-bold text-[14px] text-mutedDeep">
            Invoice {item.invoiceShort} ({item.invoiceAmount6dp})
          </span>
        </div>
        <span className="font-extrabold text-[12px] px-[11px] py-[5px] rounded-full bg-orangeBg text-orangeText">
          {item.confidencePct}% confidence
        </span>
      </div>
      <div className="text-[12.5px] text-muted mb-[14px] font-mono">
        {item.wallet} · {item.ageLabel} · {item.reason}
      </div>
      <div className="flex gap-[10px]">
        <button
          onClick={() => act('approve')}
          className="border-0 bg-green text-white font-extrabold text-[13px] px-[18px] py-[9px] rounded-[10px] cursor-pointer whitespace-nowrap"
        >
          Approve match
        </button>
        <button
          onClick={() => act('reject')}
          className="border border-border bg-card text-muted font-bold text-[13px] px-[18px] py-[9px] rounded-[10px] cursor-pointer whitespace-nowrap"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="border border-border rounded-[14px] p-4 px-[18px] h-[104px] animate-pulse bg-cream/40" />
      ))}
    </div>
  );
}

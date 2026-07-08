'use client';

import { useEffect, useState } from 'react';
import type { StatBlock } from '@/lib/db';

export function StatCards() {
  const [s, setS] = useState<StatBlock | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as StatBlock;
      if (!cancelled) setS(j);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
      <Card
        label="Matched today"
        value={s ? String(s.matchedToday) : '—'}
        hint={s && s.matchedToday > 0 ? '↑ live count' : 'Waiting for first match'}
        hintTone="positive"
      />
      <Card
        label="Volume today"
        value={s ? s.volumeToday6dp : '—'}
        hint="mUSDC · matched only"
      />
      <Card
        label="Auto-matched rate"
        value={s ? `${s.autoRatePct}%` : '—'}
        hint="Tier 1 + Tier 2 + Tier 3"
      />
      <ReviewCard queueCount={s?.queueCount ?? 0} />
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  hint: string;
  hintTone?: 'positive' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-[16px] p-5">
      <div className="text-[12.5px] font-bold text-muted mb-[10px]">{label}</div>
      <div className="text-[26px] font-extrabold">{value}</div>
      <div
        className={`text-[12px] font-bold mt-[6px] ${
          hintTone === 'positive' ? 'text-greenText' : 'text-muted'
        }`}
      >
        {hint}
      </div>
    </div>
  );
}

function ReviewCard({ queueCount }: { queueCount: number }) {
  return (
    <a
      href="/review"
      className="bg-orangeBg border border-orangeBorder rounded-[16px] p-5 block cursor-pointer no-underline"
    >
      <div className="text-[12.5px] font-bold text-orangeText mb-[10px]">
        Needs review
      </div>
      <div className="text-[26px] font-extrabold text-orangeText">
        {queueCount}
      </div>
      <div className="text-[12px] text-orangeText font-bold mt-[6px]">
        {queueCount === 0
          ? 'Queue clear.'
          : 'Below confidence threshold'}
      </div>
    </a>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface NavItemProps {
  href: string;
  icon: string;
  label: string;
  badge?: number;
}

function NavItem({ href, icon, label, badge }: NavItemProps) {
  const pathname = usePathname();
  const active = pathname === href;
  const base =
    'flex items-center gap-3 px-3 py-[11px] rounded-[10px] cursor-pointer font-bold text-[14px] transition-colors';
  const state = active
    ? 'bg-orangeBg text-orangeText'
    : 'text-ink hover:bg-cream';
  return (
    <Link href={href} className={`${base} ${state}`}>
      <span className="text-[16px] w-5 text-center">{icon}</span>
      <span>{label}</span>
      {badge ? (
        <span className="ml-auto bg-orange text-white text-[11px] font-extrabold px-2 py-[2px] rounded-full">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ merchant }: { merchant: string }) {
  const router = useRouter();
  const [queueCount, setQueueCount] = useState<number | undefined>(undefined);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/signin');
    router.refresh();
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/stats', { cache: 'no-store' });
        if (!r.ok) return;
        const s = await r.json();
        if (!cancelled) setQueueCount(s.queueCount);
      } catch { /* noop */ }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <aside className="bg-card border-b md:border-b-0 md:border-r border-border px-4 py-3 md:px-5 md:py-7 flex flex-row md:flex-col items-center md:items-stretch gap-3 md:gap-8 sticky top-0 z-20 md:static">
      <div className="flex items-center gap-[10px] px-0 md:px-2 shrink-0">
        <div className="w-[30px] h-[30px] rounded-[8px] bg-orange flex items-center justify-center text-white font-black text-[14px]">
          R
        </div>
        <span className="font-extrabold text-[18px] tracking-tight hidden sm:inline">
          Recon
        </span>
      </div>

      <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible flex-1 md:flex-none">
        <NavItem href="/dashboard" icon="◈" label="Overview" />
        <NavItem href="/dashboard/invoices" icon="≡" label="Invoices" />
        <NavItem href="/dashboard/review" icon="◐" label="Review" badge={queueCount} />
        <NavItem href="/dashboard/settings" icon="◔" label="Settings" />
      </nav>

      <div className="hidden md:flex mt-auto p-[14px] bg-orangeBg rounded-[14px] flex-col gap-2">
        <div className="font-extrabold text-[12.5px] text-orangeText font-mono">
          {short(merchant)}
        </div>
        <button
          onClick={signOut}
          className="text-[12px] text-muted leading-[1.5] text-left hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

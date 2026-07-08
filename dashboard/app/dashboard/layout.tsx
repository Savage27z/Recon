import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { getMerchantAddress } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const merchant = await getMerchantAddress();
  if (!merchant) redirect('/signin');

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-screen bg-cream text-ink">
      <Sidebar merchant={merchant} />
      <main className="px-4 py-6 md:px-11 md:py-9 max-w-[1180px]">{children}</main>
    </div>
  );
}

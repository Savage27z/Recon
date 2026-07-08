import { PageHeader } from '@/components/PageHeader';
import { StatCards } from '@/components/StatCards';
import { ReviewQueue } from '@/components/ReviewQueue';
import { LiveFeed } from '@/components/LiveFeed';
import { MatchesTable } from '@/components/MatchesTable';

export default function OverviewPage() {
  return (
    <>
      <PageHeader label="Dashboard" title="Overview" />
      <StatCards />
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5 mb-8 items-start">
        <ReviewQueue variant="card" />
        <LiveFeed />
      </div>
      <MatchesTable />
    </>
  );
}

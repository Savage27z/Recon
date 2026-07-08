import { PageHeader } from '@/components/PageHeader';
import { ReviewQueue } from '@/components/ReviewQueue';

export default function ReviewPage() {
  return (
    <>
      <PageHeader label="Dashboard" title="Review" />
      <ReviewQueue variant="panel" />
    </>
  );
}

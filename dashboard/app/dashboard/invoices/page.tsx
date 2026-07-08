'use client';

import { useRef } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CreateInvoiceForm } from '@/components/CreateInvoiceForm';
import { InvoicesTable, type InvoicesTableHandle } from '@/components/InvoicesTable';

export default function InvoicesPage() {
  const tableRef = useRef<InvoicesTableHandle>(null);

  return (
    <>
      <PageHeader label="Dashboard" title="Invoices" />
      <CreateInvoiceForm onCreated={() => tableRef.current?.refresh()} />
      <InvoicesTable ref={tableRef} />
    </>
  );
}

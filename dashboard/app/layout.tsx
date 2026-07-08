import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recon',
  description: 'Stablecoin payment reconciliation for merchants',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

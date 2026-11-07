import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Account deletion' };

export default function AccountDeletionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

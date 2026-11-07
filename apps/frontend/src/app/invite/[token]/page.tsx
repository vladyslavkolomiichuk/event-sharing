import type { Metadata } from 'next';
import { InviteLinkView } from '@/components/events/InviteLinkView';

export const metadata: Metadata = { title: 'Invitation' };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteLinkView token={token} />;
}

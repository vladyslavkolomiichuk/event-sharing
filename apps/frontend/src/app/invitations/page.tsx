import type { Metadata } from 'next';
import { InvitationsWorkspace } from '@/components/events/InvitationsWorkspace';

export const metadata: Metadata = { title: 'Invitations' };

export default function InvitationsPage() {
  return <InvitationsWorkspace />;
}

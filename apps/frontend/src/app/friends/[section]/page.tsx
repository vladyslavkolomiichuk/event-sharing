import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequireAuth } from '@/components/auth/RequireAuth';
import {
  FriendsWorkspace,
  type FriendsSection,
} from '@/components/profile/FriendsWorkspace';

const sections: FriendsSection[] = ['find', 'received', 'sent', 'blocked'];

const titles: Record<string, string> = {
  find: 'Find friends',
  received: 'Received requests',
  sent: 'Sent requests',
  blocked: 'Blocked users',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: titles[section] };
}

export default async function FriendsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as FriendsSection)) notFound();
  return (
    <RequireAuth>
      <FriendsWorkspace section={section as FriendsSection} />
    </RequireAuth>
  );
}

import { notFound } from 'next/navigation';
import { RequireAuth } from '@/components/auth/RequireAuth';
import {
  FriendsWorkspace,
  type FriendsSection,
} from '@/components/profile/FriendsWorkspace';

const sections: FriendsSection[] = ['find', 'received', 'sent', 'blocked'];

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

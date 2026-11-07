import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { SearchPreferenceSettings } from '@/components/profile/SearchPreferenceSettings';
import { SocialAccounts } from '@/components/profile/SocialAccounts';

const titles: Record<string, string> = {
  details: 'Profile details',
  'search-location': 'Search location',
  security: 'Account security',
  'social-accounts': 'Social accounts',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: titles[section] ?? 'Page not found' };
}

export default async function ProfileSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  switch (section) {
    case 'details':
      return <ProfileForm />;
    case 'search-location':
      return <SearchPreferenceSettings />;
    case 'security':
      return <AccountSecurity />;
    case 'social-accounts':
      return <SocialAccounts />;
    default:
      notFound();
  }
}

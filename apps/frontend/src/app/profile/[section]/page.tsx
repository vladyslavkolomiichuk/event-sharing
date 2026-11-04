import { notFound } from 'next/navigation';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { SearchPreferenceSettings } from '@/components/profile/SearchPreferenceSettings';
import { SocialAccounts } from '@/components/profile/SocialAccounts';

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

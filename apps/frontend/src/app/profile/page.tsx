import type { Metadata } from 'next';
import { IdentityForm } from '@/components/profile/IdentityForm';
import { ProfileLegacyRedirect } from '@/components/profile/ProfileLegacyRedirect';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <>
      <ProfileLegacyRedirect />
      <IdentityForm />
    </>
  );
}

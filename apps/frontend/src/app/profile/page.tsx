import { IdentityForm } from '@/components/profile/IdentityForm';
import { ProfileLegacyRedirect } from '@/components/profile/ProfileLegacyRedirect';

export default function ProfilePage() {
  return (
    <>
      <ProfileLegacyRedirect />
      <IdentityForm />
    </>
  );
}

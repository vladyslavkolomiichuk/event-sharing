import { RequireAuth } from '@/components/auth/RequireAuth';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { IdentityForm } from '@/components/profile/IdentityForm';
import { SearchPreferenceSettings } from '@/components/profile/SearchPreferenceSettings';
export default function ProfilePage() {
  return (
    <RequireAuth>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Account
          </p>
          <h1>Profile</h1>
          <p className="text-neutral-600">
            Manage your public details and privacy preferences.
          </p>
        </div>
        <IdentityForm />
        <SearchPreferenceSettings />
        <ProfileForm />
        <AccountSecurity />
      </div>
    </RequireAuth>
  );
}

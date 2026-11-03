import { RequireAuth } from '@/components/auth/RequireAuth';
import { PrivacySettings } from '@/components/profile/PrivacySettings';

export default function PrivacyPage() {
  return (
    <RequireAuth>
      <div className="space-y-8">
        <h1>Privacy settings</h1>
        <PrivacySettings />
      </div>
    </RequireAuth>
  );
}

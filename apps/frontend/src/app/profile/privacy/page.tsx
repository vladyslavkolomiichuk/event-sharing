import { RequireAuth } from '@/components/auth/RequireAuth';
import { PrivacySettings } from '@/components/profile/PrivacySettings';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <RequireAuth>
      <div className="space-y-8">
        <div className="space-y-3">
          <Link href="/profile" className="text-sm font-semibold underline">
            Back to profile
          </Link>
          <h1>Privacy settings</h1>
        </div>
        <PrivacySettings />
      </div>
    </RequireAuth>
  );
}

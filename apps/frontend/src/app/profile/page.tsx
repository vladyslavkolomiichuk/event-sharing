import { RequireAuth } from '@/components/auth/RequireAuth';
import Link from 'next/link';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { IdentityForm } from '@/components/profile/IdentityForm';
import { SearchPreferenceSettings } from '@/components/profile/SearchPreferenceSettings';
import { SocialAccounts } from '@/components/profile/SocialAccounts';
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
        <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label="Profile sections"
            className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
          >
            <a
              href="#identity"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Name and username
            </a>
            <a
              href="#public-profile"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Public profile
            </a>
            <a
              href="#search-preferences"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Search location
            </a>
            <a
              href="#account-security"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Account security
            </a>
            <a
              href="#social-accounts"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Social accounts
            </a>
            <Link
              href="/profile/privacy"
              className="rounded-lg px-3 py-2 hover:bg-neutral-100"
            >
              Privacy settings
            </Link>
          </nav>
          <div className="min-w-0 space-y-7">
            <div id="identity">
              <IdentityForm />
            </div>
            <div id="public-profile">
              <ProfileForm />
            </div>
            <div id="search-preferences">
              <SearchPreferenceSettings />
            </div>
            <div id="account-security">
              <AccountSecurity />
            </div>
            <div id="social-accounts">
              <SocialAccounts />
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}

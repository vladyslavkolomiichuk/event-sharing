'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';
import { NotificationStatus } from '@/components/notifications/NotificationStatus';
import { ChatHeaderLink } from '@/components/messages/ChatHeaderLink';

const links = [
  { href: '/events', label: 'Events' },
  { href: '/my-events', label: 'My events' },
  { href: '/participation', label: 'Joined' },
  { href: '/friends', label: 'Friends' },
];

export function SiteHeader() {
  const { user, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSignOut() {
    setBusy(true);
    setError('');
    try {
      await signOut();
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Event Sharing<span className="ml-2 text-neutral-400">/</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="order-3 flex w-full flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-600 lg:order-2 lg:w-auto"
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-black">
              {link.label}
            </Link>
          ))}
          <NotificationStatus />
          <ChatHeaderLink />
          {user?.role === 'ADMIN' && (
            <>
              <Link href="/admin" className="hover:text-black">
                Admin
              </Link>
              <Link href="/activity" className="hover:text-black">
                Activity
              </Link>
            </>
          )}
        </nav>
        <div className="order-2 flex items-center gap-2 lg:order-3">
          {!loading &&
            (user ? (
              <>
                <Link
                  href="/profile"
                  className="hidden text-sm text-neutral-600 hover:text-black sm:inline"
                >
                  {user.name || user.email}
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={busy}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/sign-up">Create account</Link>
                </Button>
              </>
            ))}
        </div>
        {error && <Notice message={error} tone="error" />}
      </div>
    </header>
  );
}

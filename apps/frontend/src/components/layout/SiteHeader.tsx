'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { NotificationStatus } from '@/components/notifications/NotificationStatus';
import { ChatHeaderLink } from '@/components/messages/ChatHeaderLink';
import { needsUsernameSelection } from '@event-sharing/contracts';

const mainLinks = [
  { href: '/', label: 'Explore' },
  { href: '/my-events', label: 'My events' },
  { href: '/participation', label: 'Joined events' },
  { href: '/friends', label: 'Friends' },
  { href: '/invitations', label: 'Invitations' },
];

const accountLinks = [
  { href: '/profile', label: 'Profile' },
  { href: '/profile/privacy', label: 'Privacy settings' },
];

function NavigationContent({ close }: { close?: () => void }) {
  const { user, loading, signOut } = useAuth();
  const { show } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const profileReady = user && !needsUsernameSelection(user.username);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      close?.();
      router.push('/');
      router.refresh();
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not sign out.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  function navigationLink(href: string, label: string, dangerous = false) {
    const active =
      href === '/'
        ? pathname === '/' || pathname === '/events'
        : pathname === href || pathname.startsWith(`${href}/`);
    const color = dangerous
      ? 'text-red-700 hover:bg-red-50 hover:text-red-800'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-black';
    const selected = active
      ? dangerous
        ? 'bg-red-50 font-semibold'
        : 'bg-neutral-100 font-semibold text-black'
      : '';
    return (
      <Link
        key={href}
        href={href}
        onClick={close}
        aria-current={active ? 'page' : undefined}
        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${color} ${selected}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href="/"
        onClick={close}
        className="px-3 py-2 text-lg font-semibold tracking-tight"
      >
        Event Sharing<span className="ml-2 text-neutral-400">/</span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="mt-6 flex-1 space-y-1 overflow-y-auto"
      >
        {navigationLink('/', 'Explore')}
        {profileReady && (
          <>
            {mainLinks
              .slice(1)
              .map((link) => navigationLink(link.href, link.label))}
            <div className="mt-5 border-t border-neutral-200 pt-4">
              <p className="px-3 pb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
                Messages
              </p>
              <div
                className="px-3 py-2 text-sm text-neutral-600"
                onClick={close}
              >
                <NotificationStatus />
              </div>
              <div
                className="px-3 py-2 text-sm text-neutral-600"
                onClick={close}
              >
                <ChatHeaderLink />
              </div>
            </div>
            <div className="mt-5 border-t border-neutral-200 pt-4">
              <p className="px-3 pb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
                Account
              </p>
              {accountLinks.map((link) =>
                navigationLink(link.href, link.label),
              )}
            </div>
          </>
        )}
        {profileReady && user.role === 'ADMIN' && (
          <div className="mt-5 border-t border-neutral-200 pt-4">
            <p className="px-3 pb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
              Administration
            </p>
            {navigationLink('/admin', 'Admin workspace')}
            {navigationLink('/activity', 'Activity')}
            <div className="mt-3 border-t border-red-100 pt-3">
              {navigationLink('/admin/danger-zone', 'Danger Zone', true)}
            </div>
          </div>
        )}
      </nav>
      <div className="space-y-3 border-t border-neutral-200 px-3 pt-4">
        {user && (
          <p className="truncate text-sm text-neutral-600">
            {user.name || user.email}
          </p>
        )}
        {!loading &&
          (user ? (
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              onClick={() => void handleSignOut()}
              disabled={busy}
            >
              Sign out
            </Button>
          ) : (
            <div className="space-y-2">
              <Button asChild className="w-full" size="sm" variant="outline">
                <Link href="/sign-in" onClick={close}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="w-full" size="sm">
                <Link href="/sign-up" onClick={close}>
                  Create account
                </Link>
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-neutral-200 bg-white px-4 py-5 lg:block">
        <NavigationContent />
      </aside>
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Event Sharing<span className="ml-2 text-neutral-400">/</span>
        </Link>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button variant="outline" size="sm" aria-label="Open navigation">
              Menu
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-r border-neutral-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none">
              <div className="flex justify-end">
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Close navigation"
                  >
                    Close
                  </Button>
                </Dialog.Close>
              </div>
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose a section of Event Sharing.
              </Dialog.Description>
              <NavigationContent close={() => setOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
    </>
  );
}

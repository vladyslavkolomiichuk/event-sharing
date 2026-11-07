'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { PageSkeleton } from '@/components/feedback/Skeletons';
import { Button } from '@/components/ui/button';
import { OrganizerRoleRequestDialog } from './OrganizerRoleRequestDialog';

export function RequireAuth({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: 'ADMIN' | 'ORGANIZER';
}) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!user)
    return (
      <div className="space-y-5 py-16">
        <h1>Sign in to continue</h1>
        <p className="text-neutral-600">
          Your account is required for this page.
        </p>
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  if (role && user.role !== role && user.role !== 'ADMIN')
    return (
      <div className="space-y-3 py-16">
        <h1>Access restricted</h1>
        <p className="text-neutral-600">
          This page requires the {role.toLowerCase()} role.
        </p>
        {role === 'ORGANIZER' && user.role === 'USER' && (
          <OrganizerRoleRequestDialog />
        )}
      </div>
    );
  return <>{children}</>;
}

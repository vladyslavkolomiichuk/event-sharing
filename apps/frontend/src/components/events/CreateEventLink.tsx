'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export function CreateEventLink({ size }: { size?: 'sm' }) {
  const { user } = useAuth();
  const canCreate = user?.role !== 'USER';
  return (
    <Button asChild size={size}>
      <Link href={canCreate ? '/events/new' : '/events/new?requestAccess=1'}>
        {canCreate ? 'Create event' : 'Become an organizer'}
      </Link>
    </Button>
  );
}

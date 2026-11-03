'use client';

import { needsUsernameSelection } from '@event-sharing/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from '@/components/feedback/Loading';
import { UsernameOnboarding } from './UsernameOnboarding';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Loading account…" />;
  if (user && needsUsernameSelection(user.username))
    return <UsernameOnboarding />;
  return <>{children}</>;
}

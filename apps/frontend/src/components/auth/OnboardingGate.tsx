'use client';

import { needsUsernameSelection } from '@event-sharing/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { UsernameOnboarding } from './UsernameOnboarding';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && needsUsernameSelection(user.username))
    return <UsernameOnboarding />;
  return <>{children}</>;
}
